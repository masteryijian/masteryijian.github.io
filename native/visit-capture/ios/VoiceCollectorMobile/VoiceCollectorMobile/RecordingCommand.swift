import AppIntents
import Foundation

enum RecordingCommand: String {
    case start
    case stop

    static let pendingKey = "pendingRecordingCommand"

    func enqueue() {
        UserDefaults.standard.set(rawValue, forKey: Self.pendingKey)
        NotificationCenter.default.post(name: .recordingCommandReceived, object: self)
    }

    static func consumePending() -> RecordingCommand? {
        guard let raw = UserDefaults.standard.string(forKey: pendingKey) else { return nil }
        UserDefaults.standard.removeObject(forKey: pendingKey)
        return RecordingCommand(rawValue: raw)
    }
}

extension Notification.Name {
    static let recordingCommandReceived = Notification.Name("VoiceCollector.recordingCommand")
}

struct StartVoiceRecordingIntent: AppIntent {
    static var title: LocalizedStringResource = "开始录音"
    static var description = IntentDescription("打开Voice Collector并立即使用当前iPhone或iPad开始录音。")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult & ProvidesDialog {
        RecordingCommand.start.enqueue()
        return .result(dialog: "正在打开Voice Collector并开始录音")
    }
}

struct StopVoiceRecordingIntent: AppIntent {
    static var title: LocalizedStringResource = "停止并上传"
    static var description = IntentDescription("停止iPhone录音并上传到Mac。")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult & ProvidesDialog {
        RecordingCommand.stop.enqueue()
        return .result(dialog: "正在停止录音")
    }
}

struct VoiceCollectorShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartVoiceRecordingIntent(),
            phrases: ["用\(.applicationName)开始录音", "开始\(.applicationName)录音"],
            shortTitle: "开始录音",
            systemImageName: "mic.fill"
        )
        AppShortcut(
            intent: StopVoiceRecordingIntent(),
            phrases: ["停止\(.applicationName)录音"],
            shortTitle: "停止并上传",
            systemImageName: "stop.fill"
        )
    }
}
