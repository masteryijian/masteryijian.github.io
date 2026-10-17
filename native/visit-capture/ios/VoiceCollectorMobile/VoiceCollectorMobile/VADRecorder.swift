import AVFoundation
import Foundation

final class VADRecorder {
    var onState: ((String, Float) -> Void)?
    var onSegment: ((URL, Date, Int) -> Void)?

    private let engine = AVAudioEngine()
    private var audioFile: AVAudioFile?
    private var currentURL: URL?
    private var segmentStartedAt: Date?
    private var segmentFrames: AVAudioFramePosition = 0
    private var preRoll: [AVAudioPCMBuffer] = []
    private var preRollFrames: AVAudioFramePosition = 0
    private var speechRun = 0
    private var silenceFrames: AVAudioFramePosition = 0
    private var noiseFloorDB: Float = -60
    private var calibrationFramesRemaining: AVAudioFramePosition = 0
    private var running = false
    private let outputDirectory: URL

    private let preRollSeconds = 0.5
    private let silenceStopSeconds = 1.2
    private let minimumSegmentSeconds = 0.5
    private let maximumSegmentSeconds = 20.0

    init(outputDirectory: URL) {
        self.outputDirectory = outputDirectory
    }

    func start() throws {
        guard !running else { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .default, options: [.allowBluetoothHFP])
        try session.setActive(true)
        let input = engine.inputNode
        let format = input.inputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw NSError(domain: "VoiceCollector.VAD", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "没有可用的麦克风输入"])
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.process(buffer, format: format)
        }
        engine.prepare()
        try engine.start()
        calibrationFramesRemaining = AVAudioFramePosition(format.sampleRate * 2)
        running = true
        notify("正在校准环境噪声，请稍候", level: -80)
    }

    func stop() {
        guard running else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        if audioFile != nil { finishSegment(force: true) }
        preRoll.removeAll(); preRollFrames = 0
        speechRun = 0; silenceFrames = 0
        running = false
        try? AVAudioSession.sharedInstance().setActive(false)
        notify("自动监听已停止", level: -80)
    }

    func resumeAfterInterruption() {
        guard running, !engine.isRunning else { return }
        do {
            try AVAudioSession.sharedInstance().setActive(true)
            try engine.start()
            notify("自动监听已恢复", level: -80)
        } catch {
            notify("监听恢复失败，请重新开启：\(error.localizedDescription)", level: -80)
        }
    }

    private func process(_ buffer: AVAudioPCMBuffer, format: AVAudioFormat) {
        let level = rmsDB(buffer)
        if calibrationFramesRemaining > 0, audioFile == nil {
            noiseFloorDB = noiseFloorDB * 0.85 + level * 0.15
            calibrationFramesRemaining -= AVAudioFramePosition(buffer.frameLength)
            appendPreRoll(buffer, sampleRate: format.sampleRate)
            notify("正在校准环境噪声，请稍候", level: level)
            return
        }
        let threshold = min(-25, max(-48, noiseFloorDB + 10))
        let isSpeech = level > threshold

        if audioFile == nil {
            if !isSpeech { noiseFloorDB = noiseFloorDB * 0.98 + level * 0.02 }
            appendPreRoll(buffer, sampleRate: format.sampleRate)
            speechRun = isSpeech ? speechRun + 1 : 0
            notify(isSpeech ? "检测到人声…" : "等待人声，可锁屏", level: level)
            if speechRun >= 4 { beginSegment(format: format) }
            return
        }

        do {
            try audioFile?.write(from: buffer)
            segmentFrames += AVAudioFramePosition(buffer.frameLength)
        } catch {
            notify("录音写入失败：\(error.localizedDescription)", level: level)
            finishSegment(force: true)
            return
        }
        silenceFrames = isSpeech ? 0 : silenceFrames + AVAudioFramePosition(buffer.frameLength)
        notify(isSpeech ? "正在记录人声" : "等待句子结束…", level: level)
        let duration = Double(segmentFrames) / format.sampleRate
        if Double(silenceFrames) / format.sampleRate >= silenceStopSeconds || duration >= maximumSegmentSeconds {
            finishSegment(force: false)
        }
    }

    private func beginSegment(format: AVAudioFormat) {
        let url = outputDirectory.appending(path: "vad-temp-\(UUID().uuidString).caf")
        do {
            let file = try AVAudioFile(forWriting: url, settings: format.settings)
            audioFile = file
            currentURL = url
            let seconds = Double(preRollFrames) / format.sampleRate
            segmentStartedAt = Date().addingTimeInterval(-seconds)
            segmentFrames = 0
            for saved in preRoll {
                try file.write(from: saved)
                segmentFrames += AVAudioFramePosition(saved.frameLength)
            }
            preRoll.removeAll(); preRollFrames = 0
            silenceFrames = 0; speechRun = 0
            notify("正在记录人声", level: -20)
        } catch {
            try? FileManager.default.removeItem(at: url)
            audioFile = nil; currentURL = nil
            notify("无法创建录音：\(error.localizedDescription)", level: -80)
        }
    }

    private func finishSegment(force: Bool) {
        guard let url = currentURL, let startedAt = segmentStartedAt else { return }
        let sampleRate = audioFile?.processingFormat.sampleRate ?? 48_000
        let durationMS = Int(Double(segmentFrames) / sampleRate * 1000)
        audioFile = nil; currentURL = nil; segmentStartedAt = nil
        segmentFrames = 0; silenceFrames = 0; speechRun = 0
        if durationMS >= Int(minimumSegmentSeconds * 1000) || force {
            DispatchQueue.main.async { [weak self] in self?.onSegment?(url, startedAt, durationMS) }
        } else {
            try? FileManager.default.removeItem(at: url)
        }
    }

    private func appendPreRoll(_ buffer: AVAudioPCMBuffer, sampleRate: Double) {
        guard let copy = clone(buffer) else { return }
        preRoll.append(copy)
        preRollFrames += AVAudioFramePosition(copy.frameLength)
        let maximum = AVAudioFramePosition(preRollSeconds * sampleRate)
        while preRollFrames > maximum, preRoll.count > 1 {
            preRollFrames -= AVAudioFramePosition(preRoll.removeFirst().frameLength)
        }
    }

    private func clone(_ source: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard let copy = AVAudioPCMBuffer(pcmFormat: source.format, frameCapacity: source.frameLength) else { return nil }
        copy.frameLength = source.frameLength
        let src = UnsafeMutableAudioBufferListPointer(source.mutableAudioBufferList)
        let dst = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
        for index in 0..<min(src.count, dst.count) {
            guard let from = src[index].mData, let to = dst[index].mData else { continue }
            memcpy(to, from, Int(src[index].mDataByteSize))
            dst[index].mDataByteSize = src[index].mDataByteSize
        }
        return copy
    }

    private func rmsDB(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let channels = buffer.floatChannelData, buffer.frameLength > 0 else { return -80 }
        let samples = channels[0]
        var sum: Float = 0
        for index in 0..<Int(buffer.frameLength) { sum += samples[index] * samples[index] }
        let rms = sqrt(sum / Float(buffer.frameLength))
        return max(-80, 20 * log10(max(rms, 0.0001)))
    }

    private var lastNotify: TimeInterval = 0
    private func notify(_ text: String, level: Float) {
        let now=ProcessInfo.processInfo.systemUptime
        guard now-lastNotify >= 1 else {return}
        lastNotify=now
        DispatchQueue.main.async { [weak self] in self?.onState?(text, level) }
    }
}
