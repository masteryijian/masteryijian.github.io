import AVFoundation
import Foundation
import WatchConnectivity
import WatchKit

@MainActor
final class WatchRecorderModel: NSObject, ObservableObject, AVAudioRecorderDelegate, @preconcurrency WCSessionDelegate {
    @Published private(set) var isRecording = false
    @Published private(set) var elapsed: TimeInterval = 0
    @Published private(set) var batteryLevel: Float = 1
    @Published private(set) var status = "轻点开始录音"
    @Published private(set) var handoffRequested = false
    @Published private(set) var isVADActive = false
    @Published private(set) var vadLevelDB: Float = -80
    @Published private(set) var capturedSegments = 0
    @Published private(set) var connectionStatus = "正在连接iPhone…"

    private var leaseToken = ""
    private var leaseDeadline: TimeInterval = 0
    private var lastLeaseRenew: TimeInterval = 0
    private var leaseBusy = false
    private var visitID = ""
    private func leaseCommand(_ action: String) async -> [String:Any] {
        guard WCSession.default.isReachable else {return ["granted":false]}
        return await withCheckedContinuation { continuation in
            WCSession.default.sendMessage(["command":"captureLease","action":action,"token":leaseToken],replyHandler:{continuation.resume(returning:$0)},errorHandler:{_ in continuation.resume(returning:["granted":false])})
        }
    }
    private func acquireLease() async -> Bool {
        let start=ProcessInfo.processInfo.systemUptime
        var reply=await leaseCommand("acquire")
        for _ in 0..<5 where reply["granted"] as? Bool != true {
            try? await Task.sleep(for:.seconds(1));reply=await leaseCommand("acquire")
        }
        guard reply["granted"] as? Bool == true, let token=reply["token"] as? String else {status="其他设备正在监听或Mac不可达，请在iPhone请求接力";return false}
        leaseToken=token;leaseDeadline=start+(reply["valid_for"] as? Double ?? 18)-2
        visitID=reply["visitID"] as? String ?? ""
        guard ProcessInfo.processInfo.systemUptime<leaseDeadline else {releaseLease();return false}
        return true
    }
    private func releaseLease() {
        let old=leaseToken;leaseToken="";leaseDeadline=0
        guard !old.isEmpty,WCSession.default.isReachable else{return}
        WCSession.default.sendMessage(["command":"captureLease","action":"release","token":old],replyHandler:{_ in},errorHandler:{_ in})
    }
    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var startedAt: Date?
    private var sessionID: String?
    private var vadRecorder: WatchVADRecorder?
    private let recordingsDirectory: URL

    override init() {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        recordingsDirectory = documents.appending(path: "WatchRecordings", directoryHint: .isDirectory)
        super.init()
        try? FileManager.default.createDirectory(at: recordingsDirectory, withIntermediateDirectories: true)
        WKInterfaceDevice.current().isBatteryMonitoringEnabled = true
        updateBattery()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    func toggleRecording() async {
        if isRecording { stopAndQueue(reason: "已停止，等待传给iPhone") }
        else if isVADActive { status = "请先停止VAD" }
        else { await startRecording() }
    }

    func toggleVAD() async {
        if isVADActive { stopVAD(reason: "VAD已停止") }
        else if isRecording { status = "请先停止连续录音" }
        else { await startVAD() }
    }

    func startVADFromComplication() async {
        guard !isRecording else {
            status = "正在连续录音，请先停止后再开启VAD"
            return
        }
        guard !isVADActive else {
            status = "VAD正在监听"
            return
        }
        status = "正在从表盘启动VAD…"
        await startVAD()
    }

    func testPhoneHandoff() {
        guard (isRecording || isVADActive), !handoffRequested else { return }
        requestPhoneHandoff()
    }

    func testConnection() {
        let session = WCSession.default
        guard session.activationState == .activated else { connectionStatus = "连接尚未激活"; return }
        guard session.isReachable else { connectionStatus = "iPhone当前不可达，可后台排队"; return }
        connectionStatus = "正在测试…"
        session.sendMessage(["command": "ping"], replyHandler: { [weak self] response in
            Task { @MainActor in self?.connectionStatus = response["ok"] as? Bool == true ? "iPhone通信正常" : "iPhone响应异常" }
        }, errorHandler: { [weak self] error in
            Task { @MainActor in self?.connectionStatus = "通信失败：\(error.localizedDescription)" }
        })
    }

    private func startRecording() async {
        let allowed = await AVAudioApplication.requestRecordPermission()
        guard allowed else { status = "请在设置中允许麦克风"; return }
        guard await acquireLease() else {return}
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.record, mode: .default)
            try audioSession.setActive(true)
            let now = Date()
            let id = UUID().uuidString
            let url = recordingsDirectory.appending(path: "watch-temp-\(id).m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: 16_000,
                AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: 48_000,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
            ]
            let newRecorder = try AVAudioRecorder(url: url, settings: settings)
            newRecorder.delegate = self
            guard newRecorder.record() else { throw RecordingError.cannotStart }
            recorder = newRecorder
            startedAt = now
            sessionID = id
            elapsed = 0
            handoffRequested = false
            isRecording = true
            status = "手表正在录音"
            timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.tick() }
            }
        } catch {
            status = "无法录音：\(error.localizedDescription)"
        }
    }

    private func startVAD() async {
        let allowed = await AVAudioApplication.requestRecordPermission()
        guard allowed else { status = "请在设置中允许麦克风"; return }
        guard await acquireLease() else {return}
        let vad = WatchVADRecorder(outputDirectory: recordingsDirectory)
        vad.onState = { [weak self] text, level in self?.status = text; self?.vadLevelDB = level }
        let capturedVisit=visitID
        vad.onSegment = { [weak self] url, date, duration in
            self?.acceptVADSegment(url: url, recordedAt: date, durationMS: duration, capturedVisit:capturedVisit)
        }
        do {
            try vad.start()
            vadRecorder = vad
            startedAt = Date(); sessionID = UUID().uuidString
            elapsed = 0; capturedSegments = 0; handoffRequested = false
            isVADActive = true
            timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.tick() }
            }
        } catch { status = "无法开启VAD：\(error.localizedDescription)" }
    }

    private func stopVAD(reason: String) {
        vadRecorder?.stop(); vadRecorder = nil
        timer?.invalidate(); timer = nil
        isVADActive = false; vadLevelDB = -80
        releaseLease()
        startedAt = nil; sessionID = nil
        status = reason
    }

    private func acceptVADSegment(url: URL, recordedAt: Date, durationMS: Int, capturedVisit: String) {
        let id = UUID().uuidString
        let timestamp = Int64(recordedAt.timeIntervalSince1970 * 1000)
        let target = recordingsDirectory.appending(path: "watch-\(timestamp)-\(durationMS)-\(id).caf")
        do {
            try FileManager.default.moveItem(at: url, to: target)
            WCSession.default.transferFile(target, metadata: [
                "recordedAtMS": timestamp, "durationMS": durationMS,
                "sessionID": id, "source": "apple-watch", "fileExtension": "caf", "visitID":capturedVisit
            ])
            capturedSegments += 1
        } catch { status = "VAD片段排队失败：\(error.localizedDescription)" }
    }

    private func tick() {
        guard isRecording || isVADActive else { return }
        elapsed = Date().timeIntervalSince(startedAt ?? Date())
        if ProcessInfo.processInfo.systemUptime >= leaseDeadline {
            if isVADActive {stopVAD(reason:"授权到期，已停止监听")} else {stopAndQueue(reason:"授权到期，已停止录音")}
            return
        }
        let now=ProcessInfo.processInfo.systemUptime
        if now-lastLeaseRenew>=6 && !leaseBusy {
            leaseBusy=true;lastLeaseRenew=now
            Task {
                let reply=await leaseCommand("renew");leaseBusy=false
                if reply["granted"] as? Bool == true, !leaseToken.isEmpty {leaseDeadline=now+16}
                else if isVADActive {stopVAD(reason:"接力或连接断开，已停止监听")}
                else if isRecording {stopAndQueue(reason:"接力或连接断开，已停止录音")}
            }
        }
        updateBattery()
        if batteryLevel <= 0.20, !handoffRequested { requestPhoneHandoff() }
        if batteryLevel <= 0.10, handoffRequested {
            if isVADActive { stopVAD(reason: "电量过低，VAD已停止") }
            else { stopAndQueue(reason: "电量过低，录音已安全保存") }
        }
    }

    private func updateBattery() {
        let value = WKInterfaceDevice.current().batteryLevel
        if value >= 0 { batteryLevel = value }
    }

    private func requestPhoneHandoff() {
        guard let sessionID else { return }
        handoffRequested = true
        status = "电量20%，正在请求iPhone接力"
        let mode = isVADActive ? "vad" : "continuous"
        if isVADActive {stopVAD(reason:"已停止手表监听，等待iPhone接力")}
        else if isRecording {stopAndQueue(reason:"已停止手表录音，等待iPhone接力")}
        let payload: [String: Any] = ["command": "handoff", "sessionID": sessionID, "mode": mode]
        let session = WCSession.default
        if session.isReachable {
            session.sendMessage(payload, replyHandler: { [weak self] response in
                guard response["started"] as? Bool == true else {
                    session.transferUserInfo(payload)
                    Task { @MainActor in self?.status = "请在iPhone通知中确认接力" }
                    return
                }
                Task { @MainActor in self?.finishAfterHandoff() }
            }, errorHandler: { [weak self] _ in
                session.transferUserInfo(payload)
                Task { @MainActor in self?.status = "请在iPhone通知中确认接力" }
            })
        } else {
            session.transferUserInfo(payload)
            status = "手表已停止，等待iPhone前台确认接力"
        }
    }

    private func finishAfterHandoff() {
        if isVADActive { stopVAD(reason: "iPhone已接力VAD") }
        else if isRecording { stopAndQueue(reason: "iPhone已接力录音") }
    }

    private func stopAndQueue(reason: String) {
        guard let recorder, let startedAt, let sessionID else { return }
        recorder.stop()
        timer?.invalidate(); timer = nil
        isRecording = false
        releaseLease()
        let durationMS = max(100, Int(Date().timeIntervalSince(startedAt) * 1000))
        let timestampMS = Int64(startedAt.timeIntervalSince1970 * 1000)
        let target = recordingsDirectory.appending(path: "watch-\(timestampMS)-\(durationMS)-\(sessionID).m4a")
        do {
            try FileManager.default.moveItem(at: recorder.url, to: target)
            let metadata: [String: Any] = [
                "recordedAtMS": timestampMS,
                "durationMS": durationMS,
                "sessionID": sessionID,
                "source": "apple-watch",
                "fileExtension": "m4a", "visitID":visitID
            ]
            WCSession.default.transferFile(target, metadata: metadata)
            status = reason
        } catch {
            status = "录音已停止，但排队失败：\(error.localizedDescription)"
        }
        self.recorder = nil
        self.startedAt = nil
        self.sessionID = nil
        try? AVAudioSession.sharedInstance().setActive(false)
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
                            error: Error?) {
        Task { @MainActor in
            if let error { connectionStatus = "连接失败：\(error.localizedDescription)" }
            else { connectionStatus = session.isReachable ? "iPhone已连接" : "已激活，等待iPhone" }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        if userInfo["command"] as? String == "fileDurable",let name=userInfo["filename"] as? String,name==URL(fileURLWithPath:name).lastPathComponent {
            Task {@MainActor in try? FileManager.default.removeItem(at:recordingsDirectory.appendingPathComponent(name))}
            return
        }
        guard userInfo["command"] as? String == "handoffStarted",
              let incomingID = userInfo["sessionID"] as? String else { return }
        Task { @MainActor in
            if (isRecording || isVADActive), incomingID == sessionID { finishAfterHandoff() }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any],
                             replyHandler: @escaping ([String: Any]) -> Void) {
        if message["command"] as? String == "startCapture" {
            Task {@MainActor in
                if !isVADActive && !isRecording {await startVAD()}
                replyHandler(["started":isVADActive || isRecording])
            }
            return
        }
        if message["command"] as? String == "ping" {
            replyHandler(["ok": true, "time": Date().timeIntervalSince1970])
        } else { replyHandler(["ok": false]) }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in connectionStatus = session.isReachable ? "iPhone已连接" : "iPhone不可达，可后台排队" }
    }

    nonisolated func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        guard error == nil else { return }
        // Retain Watch audio until explicit durable-file acknowledgement from iPhone.
    }

    enum RecordingError: LocalizedError {
        case cannotStart
        var errorDescription: String? { "录音器未能启动" }
    }
}
