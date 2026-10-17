import AVFoundation
import Combine
import Foundation
import UIKit

@MainActor
final class RecorderModel: NSObject, ObservableObject, AVAudioRecorderDelegate {
    @Published private(set) var isRecording = false
    @Published private(set) var elapsed: TimeInterval = 0
    @Published private(set) var queuedCount = 0
    @Published private(set) var isVADActive = false
    @Published private(set) var vadLevelDB: Float = -80
    @Published private(set) var capturedSegments = 0
    @Published private(set) var watchConnectionStatus = "Watch连接未检测"
    @Published var status = "准备就绪"

    private var captureVisitID = ""
    private var uploading = Set<String>()
    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var startedAt: Date?
    private let queueDirectory: URL
    private var vadRecorder: VADRecorder?
    private var commandObserver: NSObjectProtocol?

    override init() {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        queueDirectory = documents.appending(path: "UploadQueue", directoryHint: .isDirectory)
        super.init()
        try? FileManager.default.createDirectory(at: queueDirectory, withIntermediateDirectories: true)
        NotificationCenter.default.addObserver(self, selector: #selector(audioInterrupted),
            name: AVAudioSession.interruptionNotification, object: nil)
        commandObserver = NotificationCenter.default.addObserver(
            forName: .recordingCommandReceived, object: nil, queue: .main
        ) { [weak self] notification in
            guard let command = notification.object as? RecordingCommand else { return }
            Task { @MainActor in await self?.handle(command) }
        }
        let connectivity = PhoneWatchConnectivity.shared
        connectivity.onHandoffRequested = { [weak self] sessionID, mode, completion in
            Task { @MainActor in
                let started: Bool
                if mode == "vad" {
                    started = await self?.startVADForHandoff() ?? false
                } else {
                    started = await self?.startRecording(sessionID: sessionID, allowStoppingVAD: true) ?? false
                }
                if started { connectivity.tellWatchHandoffStarted(sessionID: sessionID) }
                completion(started)
            }
        }
        connectivity.onConnectionChanged = { [weak self] text in self?.watchConnectionStatus = text }
        connectivity.onWatchFileReceived = { [weak self] in
            self?.refreshQueueCount()
            Task { await self?.retryQueuedUploads() }
        }
        connectivity.activate()
        CaptureCoordinator.shared.onLost = { [weak self] in
            guard let self else {return}
            if self.isVADActive {self.stopVAD()}
            if self.isRecording {self.stopRecording()}
        }
        refreshQueueCount()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        if let commandObserver { NotificationCenter.default.removeObserver(commandObserver) }
    }

    @objc private func audioInterrupted(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if type == .began {
            status = "录音被电话或其他音频暂时中断"
        } else {
            let rawOptions = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            if AVAudioSession.InterruptionOptions(rawValue: rawOptions).contains(.shouldResume) {
                vadRecorder?.resumeAfterInterruption()
            } else if isVADActive {
                status = "监听已中断，请关闭后重新开启"
            }
        }
    }

    func toggleRecording() async {
        if isRecording { stopRecording() } else { _ = await startRecording() }
    }

    func handlePendingCommand() async {
        if let command = RecordingCommand.consumePending() { await handle(command) }
        if let (sessionID, mode) = PhoneWatchConnectivity.shared.completePendingHandoffIfNeeded() {
            let started: Bool
            if mode == "vad" { started = await startVADForHandoff() }
            else { started = await startRecording(sessionID: sessionID, allowStoppingVAD: true) }
            if started { PhoneWatchConnectivity.shared.tellWatchHandoffStarted(sessionID: sessionID) }
        }
    }

    func handoffToWatch() async {
        if isRecording {stopRecording()}
        if isVADActive {stopVAD()}
        do {
            _ = try await CaptureCoordinator.shared.command("request",owner:"watch-"+CaptureCoordinator.shared.deviceID)
            let started=await PhoneWatchConnectivity.shared.requestWatchCapture()
            status=started ? "手表已接力，本机麦克风停止" : "手表不可达或接力失败；可在手表前台手动开启"
        } catch {status="接力请求失败，本机已停止"}
    }
    func testWatchConnection() {
        watchConnectionStatus = "正在测试Watch通信…"
        PhoneWatchConnectivity.shared.testWatchConnection { [weak self] text in self?.watchConnectionStatus = text }
    }

    private func handle(_ command: RecordingCommand) async {
        switch command {
        case .start:
            _ = await startRecording(allowStoppingVAD: true)
        case .stop:
            if isRecording { stopRecording() }
        }
    }

    func toggleVAD() async {
        if isVADActive { stopVAD() } else { _ = await startVAD() }
    }

    @discardableResult
    private func startVAD() async -> Bool {
        guard !isRecording else { status = "请先结束手动录音"; return false }
        let allowed = await AVAudioApplication.requestRecordPermission()
        guard allowed else { status = "麦克风权限未开启"; return false }
        guard await CaptureCoordinator.shared.acquire() else {status=CaptureCoordinator.shared.status;return false}
        let vad = VADRecorder(outputDirectory: queueDirectory)
        vad.onState = { [weak self] text, level in
            self?.status = text; self?.vadLevelDB = level
        }
        let capturedVisit = CaptureCoordinator.shared.activeVisit
        vad.onSegment = { [weak self] url, date, duration in
            self?.acceptVADSegment(url: url, recordedAt: date, durationMS: duration, visitID:capturedVisit)
        }
        do {
            try vad.start()
            vadRecorder = vad
            isVADActive = true
            capturedSegments = 0
            return true
        } catch {
            await CaptureCoordinator.shared.release()
            status = "无法开启自动监听：\(error.localizedDescription)"
            return false
        }
    }

    private func startVADForHandoff() async -> Bool {
        if isVADActive { return true }
        if isRecording { stopRecording() }
        return await startVAD()
    }

    private func stopVAD() {
        vadRecorder?.stop(); vadRecorder = nil
        isVADActive = false; vadLevelDB = -80
        CaptureCoordinator.shared.stopLease()
    }

    private func acceptVADSegment(url: URL, recordedAt: Date, durationMS: Int, visitID: String) {
        let target = queueDirectory.appending(path: "recording-\(Int(recordedAt.timeIntervalSince1970 * 1000))-\(durationMS).caf")
        try? FileManager.default.moveItem(at: url, to: target)
        let visit=visitID
        try? Data(visit.utf8).write(to:target.appendingPathExtension("visit"),options:.atomic)
        capturedSegments += 1
        refreshQueueCount()
        Task { await upload(file: target, recordedAt: recordedAt, durationMS: durationMS) }
    }

    @discardableResult
    private func startRecording(sessionID: String? = nil, allowStoppingVAD: Bool = false) async -> Bool {
        if isRecording { status = "iPhone已经在录音"; return true }
        if isVADActive, allowStoppingVAD { stopVAD() }
        guard !isVADActive else { status = "请先关闭自动监听"; return false }
        let allowed = await AVAudioApplication.requestRecordPermission()
        guard allowed else { status = "麦克风权限未开启"; return false }
        guard await CaptureCoordinator.shared.acquire() else {status=CaptureCoordinator.shared.status;return false}
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .default, options: [.allowBluetoothHFP])
            try session.setActive(true)
            let date = Date()
            let filename = "recording-\(Int(date.timeIntervalSince1970 * 1000)).m4a"
            let url = queueDirectory.appending(path: filename)
            let settings: [String: Any] = [AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                                           AVSampleRateKey: 16_000,
                                           AVNumberOfChannelsKey: 1,
                                           AVEncoderBitRateKey: 48_000,
                                           AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue]
            recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder?.delegate = self
            guard recorder?.record() == true else {throw UploadError.invalidResponse}
            captureVisitID=CaptureCoordinator.shared.activeVisit
            startedAt = date
            elapsed = 0
            isRecording = true
            status = sessionID == nil ? "正在录音，可锁屏" : "iPhone已接力，正在录音"
            timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.elapsed = Date().timeIntervalSince(self?.startedAt ?? Date()) }
            }
            return true
        } catch {
            await CaptureCoordinator.shared.release()
            status = "无法开始录音：\(error.localizedDescription)"
            return false
        }
    }

    private func stopRecording() {
        guard let recorder, let startedAt else { return }
        recorder.stop()
        timer?.invalidate(); timer = nil
        isRecording = false
        let duration = max(100, Int(Date().timeIntervalSince(startedAt) * 1000))
        let queuedURL = queueDirectory.appending(path: "recording-\(Int(startedAt.timeIntervalSince1970 * 1000))-\(duration).m4a")
        try? FileManager.default.moveItem(at: recorder.url, to: queuedURL)
        try? Data(captureVisitID.utf8).write(to:queuedURL.appendingPathExtension("visit"),options:.atomic)
        self.recorder = nil
        self.startedAt = nil
        try? AVAudioSession.sharedInstance().setActive(false)
        refreshQueueCount()
        CaptureCoordinator.shared.stopLease()
        status = "已保存，准备上传"
        Task { await upload(file: queuedURL, recordedAt: startedAt, durationMS: duration) }
    }

    func retryQueuedUploads() async {
        guard !isRecording else { return }
        let files = (try? FileManager.default.contentsOfDirectory(at: queueDirectory,
            includingPropertiesForKeys: [.creationDateKey], options: [.skipsHiddenFiles])) ?? []
        for file in files where ["m4a", "caf"].contains(file.pathExtension.lowercased()) && (file.lastPathComponent.hasPrefix("recording-") || file.lastPathComponent.hasPrefix("watch-")) {
            let parts = file.deletingPathExtension().lastPathComponent.split(separator: "-")
            let timestampMS = parts.count >= 3 ? Double(parts[1]) : nil
            let durationMS = parts.count >= 3 ? Int(parts[2]) ?? 1000 : 1000
            let values = try? file.resourceValues(forKeys: [.creationDateKey])
            let recordedAt = timestampMS.map { Date(timeIntervalSince1970: $0 / 1000) } ?? values?.creationDate ?? Date()
            let source = parts.first == "watch" ? "apple-watch" : nil
            await upload(file: file, recordedAt: recordedAt, durationMS: durationMS, deviceOverride: source)
        }
    }

    private func upload(file: URL, recordedAt: Date, durationMS: Int, deviceOverride: String? = nil) async {
        guard !uploading.contains(file.path) else {return}
        uploading.insert(file.path);defer{uploading.remove(file.path)}
        let config = ServerConfig.shared
        let visit = (try? String(contentsOf:file.appendingPathExtension("visit"),encoding:.utf8)) ?? CaptureCoordinator.shared.activeVisit
        do {
            let identifier = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
            let family = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone"
            let device = deviceOverride ?? "\(family)-\(identifier)"
            try await UploadClient(serverURL: config.serverURL, token: config.token)
                .upload(file: file, recordedAt: recordedAt, durationMS: durationMS, deviceID: device, visitID:visit)
            try FileManager.default.removeItem(at: file)
            try? FileManager.default.removeItem(at:file.appendingPathExtension("visit"))
            status = "上传成功，等待Mac转写"
        } catch {
            status = "保存在手机，稍后重试：\(error.localizedDescription)"
        }
        refreshQueueCount()
    }

    private func refreshQueueCount() {
        queuedCount = ((try? FileManager.default.contentsOfDirectory(at: queueDirectory,
            includingPropertiesForKeys: nil)) ?? []).filter { ["m4a", "caf"].contains($0.pathExtension.lowercased()) }.count
    }
}
