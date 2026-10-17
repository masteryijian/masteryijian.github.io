import SwiftUI

@main
struct VoiceCollectorWatchApp: App {
    @StateObject private var recorder = WatchRecorderModel()

    var body: some Scene {
        WindowGroup {
            WatchContentView()
                .environmentObject(recorder)
                .onOpenURL { url in
                    guard url.scheme == "voicecollector", url.host == "start-vad" else { return }
                    Task { await recorder.startVADFromComplication() }
                }
        }
    }
}
