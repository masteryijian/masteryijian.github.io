import SwiftUI

@main
struct VoiceCollectorMobileApp: App {
    @StateObject private var recorder = RecorderModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            VisitConsoleView()
                .environmentObject(recorder)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task {
                    await recorder.handlePendingCommand()
                    await recorder.retryQueuedUploads()
                }
            }
        }
    }
}
