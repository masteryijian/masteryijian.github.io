import SwiftUI

struct WatchContentView: View {
    @EnvironmentObject var recorder: WatchRecorderModel

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: (recorder.isRecording || recorder.isVADActive) ? "waveform.circle.fill" : "mic.circle.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(recorder.isRecording ? .red : (recorder.isVADActive ? .green : .blue))
                Text(format(recorder.elapsed))
                    .font(.system(.title2, design: .monospaced)).bold()
                Text("电量 \(Int(recorder.batteryLevel * 100))%")
                    .font(.footnote)
                    .foregroundStyle(recorder.batteryLevel <= 0.20 ? .orange : .secondary)
                Text(recorder.status)
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                Text(recorder.connectionStatus)
                    .font(.caption2).foregroundStyle(.secondary)
                if recorder.isVADActive {
                    ProgressView(value: Double(max(-80, min(-10, recorder.vadLevelDB)) + 80), total: 70)
                        .tint(recorder.vadLevelDB > -42 ? .green : .blue)
                    Text("已记录 \(recorder.capturedSegments) 段").font(.caption2)
                }
                Button {
                    Task { await recorder.toggleRecording() }
                } label: {
                    Label(recorder.isRecording ? "停止" : "开始录音",
                          systemImage: recorder.isRecording ? "stop.fill" : "mic.fill")
                }
                .buttonStyle(.borderedProminent)
                .tint(recorder.isRecording ? .red : .blue)
                .disabled(recorder.isVADActive)
                Button {
                    Task { await recorder.toggleVAD() }
                } label: {
                    Label(recorder.isVADActive ? "停止VAD" : "开启VAD",
                          systemImage: recorder.isVADActive ? "stop.fill" : "waveform.badge.mic")
                }
                .buttonStyle(.borderedProminent)
                .tint(recorder.isVADActive ? .orange : .green)
                .disabled(recorder.isRecording)
                if (recorder.isRecording || recorder.isVADActive) && !recorder.handoffRequested {
                    Button("测试手机接力") { recorder.testPhoneHandoff() }
                        .font(.footnote)
                }
                Button("测试iPhone通信") { recorder.testConnection() }
                    .font(.caption2)
            }
            .padding(.horizontal, 4)
        }
    }

    private func format(_ value: TimeInterval) -> String {
        String(format: "%02d:%02d", Int(value) / 60, Int(value) % 60)
    }
}
