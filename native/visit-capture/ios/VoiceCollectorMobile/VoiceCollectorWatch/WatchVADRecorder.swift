import AVFoundation
import Foundation

final class WatchVADRecorder {
    var onState: ((String, Float) -> Void)?
    var onSegment: ((URL, Date, Int) -> Void)?

    private let engine = AVAudioEngine()
    private let outputDirectory: URL
    private var audioFile: AVAudioFile?
    private var currentURL: URL?
    private var segmentStartedAt: Date?
    private var segmentFrames: AVAudioFramePosition = 0
    private var silenceFrames: AVAudioFramePosition = 0
    private var calibrationFrames: AVAudioFramePosition = 0
    private var preRoll: [AVAudioPCMBuffer] = []
    private var preRollFrames: AVAudioFramePosition = 0
    private var speechRun = 0
    private var noiseFloorDB: Float = -60
    private var running = false

    init(outputDirectory: URL) { self.outputDirectory = outputDirectory }

    func start() throws {
        guard !running else { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .default)
        try session.setActive(true)
        let input = engine.inputNode
        let format = input.inputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw NSError(domain: "VoiceCollector.WatchVAD", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "没有可用的麦克风输入"])
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.process(buffer, format: format)
        }
        engine.prepare()
        try engine.start()
        calibrationFrames = AVAudioFramePosition(format.sampleRate * 2)
        running = true
        notify("校准环境噪声…", -80)
    }

    func stop() {
        guard running else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        if audioFile != nil { finishSegment(force: true) }
        running = false
        preRoll.removeAll(); preRollFrames = 0
        try? AVAudioSession.sharedInstance().setActive(false)
        notify("VAD已停止", -80)
    }

    private func process(_ buffer: AVAudioPCMBuffer, format: AVAudioFormat) {
        let level = rmsDB(buffer)
        if calibrationFrames > 0, audioFile == nil {
            noiseFloorDB = noiseFloorDB * 0.85 + level * 0.15
            calibrationFrames -= AVAudioFramePosition(buffer.frameLength)
            appendPreRoll(buffer, sampleRate: format.sampleRate)
            notify("校准环境噪声…", level)
            return
        }
        let threshold = min(-25, max(-48, noiseFloorDB + 10))
        let speech = level > threshold
        if audioFile == nil {
            if !speech { noiseFloorDB = noiseFloorDB * 0.98 + level * 0.02 }
            appendPreRoll(buffer, sampleRate: format.sampleRate)
            speechRun = speech ? speechRun + 1 : 0
            notify(speech ? "检测到人声…" : "等待人声", level)
            if speechRun >= 4 { beginSegment(format: format) }
            return
        }
        do {
            try audioFile?.write(from: buffer)
            segmentFrames += AVAudioFramePosition(buffer.frameLength)
        } catch {
            notify("写入失败", level); finishSegment(force: true); return
        }
        silenceFrames = speech ? 0 : silenceFrames + AVAudioFramePosition(buffer.frameLength)
        notify(speech ? "正在记录人声" : "等待句子结束…", level)
        let duration = Double(segmentFrames) / format.sampleRate
        if Double(silenceFrames) / format.sampleRate >= 1.2 || duration >= 120 {
            finishSegment(force: false)
        }
    }

    private func beginSegment(format: AVAudioFormat) {
        let url = outputDirectory.appending(path: "watch-vad-temp-\(UUID().uuidString).caf")
        do {
            let file = try AVAudioFile(forWriting: url, settings: format.settings)
            audioFile = file; currentURL = url
            segmentStartedAt = Date().addingTimeInterval(-Double(preRollFrames) / format.sampleRate)
            segmentFrames = 0
            for buffer in preRoll {
                try file.write(from: buffer)
                segmentFrames += AVAudioFramePosition(buffer.frameLength)
            }
            preRoll.removeAll(); preRollFrames = 0; silenceFrames = 0; speechRun = 0
        } catch {
            try? FileManager.default.removeItem(at: url)
            audioFile = nil; currentURL = nil
            notify("无法建立片段", -80)
        }
    }

    private func finishSegment(force: Bool) {
        guard let url = currentURL, let date = segmentStartedAt else { return }
        let sampleRate = audioFile?.processingFormat.sampleRate ?? 48_000
        let durationMS = Int(Double(segmentFrames) / sampleRate * 1000)
        audioFile = nil; currentURL = nil; segmentStartedAt = nil
        segmentFrames = 0; silenceFrames = 0; speechRun = 0
        if durationMS >= 500 || force {
            DispatchQueue.main.async { [weak self] in self?.onSegment?(url, date, durationMS) }
        } else { try? FileManager.default.removeItem(at: url) }
    }

    private func appendPreRoll(_ buffer: AVAudioPCMBuffer, sampleRate: Double) {
        guard let copy = clone(buffer) else { return }
        preRoll.append(copy); preRollFrames += AVAudioFramePosition(copy.frameLength)
        let maximum = AVAudioFramePosition(sampleRate * 0.5)
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
        var sum: Float = 0
        for i in 0..<Int(buffer.frameLength) { sum += channels[0][i] * channels[0][i] }
        return max(-80, 20 * log10(max(sqrt(sum / Float(buffer.frameLength)), 0.0001)))
    }

    private func notify(_ text: String, _ level: Float) {
        DispatchQueue.main.async { [weak self] in self?.onState?(text, level) }
    }
}
