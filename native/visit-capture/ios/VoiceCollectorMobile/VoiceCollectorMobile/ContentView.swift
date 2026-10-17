import SwiftUI

struct ContentView: View {
    @EnvironmentObject var recorder: RecorderModel
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 26) {
                Spacer()
                Image(systemName: recorder.isRecording ? "waveform.circle.fill" : "mic.circle.fill")
                    .font(.system(size: 110)).foregroundStyle(recorder.isRecording ? .red : .blue)
                Text(format(recorder.elapsed)).font(.system(size: 38, design: .monospaced)).bold()
                Text(recorder.status).multilineTextAlignment(.center).foregroundStyle(.secondary)
                Text(recorder.watchConnectionStatus).font(.footnote).foregroundStyle(.secondary)
                Button("测试Apple Watch通信") { recorder.testWatchConnection() }
                    .font(.footnote)
                if recorder.isVADActive {
                    ProgressView(value: Double(max(-80, min(-10, recorder.vadLevelDB)) + 80), total: 70)
                        .tint(recorder.vadLevelDB > -42 ? .green : .blue)
                    Text("已捕获 \(recorder.capturedSegments) 段 · 后台自动监听中")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if recorder.queuedCount > 0 { Text("本机待上传：\(recorder.queuedCount) 条").foregroundStyle(.orange) }
                Button(recorder.isRecording ? "停止并上传" : "开始录音") {
                    Task { await recorder.toggleRecording() }
                }
                .buttonStyle(.borderedProminent).tint(recorder.isRecording ? .red : .blue)
                .controlSize(.large)
                Button(recorder.isVADActive ? "关闭后台自动监听" : "开启后台自动VAD") {
                    Task { await recorder.toggleVAD() }
                }
                .buttonStyle(.borderedProminent)
                .tint(recorder.isVADActive ? .orange : .green)
                .controlSize(.large)
                .disabled(recorder.isRecording)
                Button("重试待上传录音") { Task { await recorder.retryQueuedUploads() } }
                    .disabled(recorder.isRecording || recorder.queuedCount == 0)
                Spacer()
            }
            .padding()
            .frame(maxWidth: 620)
            .frame(maxWidth: .infinity)
            .navigationTitle("Voice Collector")
            .toolbar { Button("设置") { showSettings = true } }
            .sheet(isPresented: $showSettings) { SettingsView() }
        }
    }

    private func format(_ value: TimeInterval) -> String {
        String(format: "%02d:%02d", Int(value) / 60, Int(value) % 60)
    }
}
