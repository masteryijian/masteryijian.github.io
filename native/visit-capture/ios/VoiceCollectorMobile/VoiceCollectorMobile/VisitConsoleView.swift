import SwiftUI
import UIKit
struct VisitClip: Decodable, Identifiable {
    let id: Int
    let transcript: String?
    let summary: String?
    let title: String?
    let transcription_status: String
    let enrichment_status: String
    let audio_status: String
}
struct VisitInfo: Decodable {
    let id: String
    let customer: String
    let focus: String
    let summary_json: String?
}
struct VisitConsoleData: Decodable {
    let visit: VisitInfo?
    let clips: [VisitClip]
    let lease: CaptureReply
    let asr: String
    let llm: String
}
@MainActor final class VisitConsoleModel: ObservableObject {
    @Published var data: VisitConsoleData?
    @Published var status = "等待连接Mac"
    @Published var customer = ""
    @Published var focus = ""
    func refresh() async {
        do {
            let raw=try await CaptureCoordinator.shared.request("api/mobile/console")
            let result=try JSONDecoder().decode(VisitConsoleData.self,from:raw)
            data=result;CaptureCoordinator.shared.activeVisit=result.visit?.id ?? ""
            DeviceSmoke.write(["phase":"connected","asr":result.asr,"llm":result.llm])
            status="已连接 · \(result.asr) → \(result.llm)"
        } catch {status="连接失败："+error.localizedDescription;DeviceSmoke.write(["phase":"connection_failed","error":error.localizedDescription])}
    }
    func create() async {
        guard !customer.trimmingCharacters(in:.whitespaces).isEmpty else{return}
        do {
            _ = try await CaptureCoordinator.shared.request("api/mobile/visits",body:["customer":customer,"focus":focus])
            customer="";focus="";await refresh()
        } catch {status="创建失败，未改变当前拜访"}
    }
}
struct VisitConsoleView: View {
    @EnvironmentObject var recorder: RecorderModel
    @StateObject private var model=VisitConsoleModel()
    @StateObject private var coordinator=CaptureCoordinator.shared
    @State private var settings=false
    private func label(_ value: String) -> String { ["done":"已完成","pending":"待处理","failed":"失败待重试","processing":"处理中","empty":"未识别文字·原音保留","skipped":"短片段·原文保留","active":"已保存","deleted":"已清理" ][value] ?? value }
    var body: some View {
        NavigationStack {
            List {
                Section("客户拜访控制台") {
                    Text(model.status).font(.footnote)
                    Text("当前监听："+(model.data?.lease.owner ?? "无"))
                    Text(coordinator.status).font(.footnote).foregroundStyle(.secondary)
                    if let visit=model.data?.visit {Text("当前客户："+visit.customer).font(.headline);Text(visit.focus)}
                    TextField("客户 / 公司",text:$model.customer)
                    TextField("此次拜访目标",text:$model.focus)
                    Button("开始新的客户拜访") {Task{await model.create()}}
                        .disabled(recorder.isRecording || recorder.isVADActive)
                    Button("刷新记录") {Task{await model.refresh()}}
                }
                Section("录音与设备接力") {
                    Text(recorder.status)
                    Label(recorder.isVADActive ? "后台人声监听中" : recorder.isRecording ? "连续录音中" : "麦克风未启动",systemImage:recorder.isRecording || recorder.isVADActive ? "mic.fill":"mic.slash")
                    Button(recorder.isVADActive ? "停止监听并保存" : "开始人声分段监听") {Task{await recorder.toggleVAD()}}
                        .disabled(recorder.isRecording || coordinator.activeVisit.isEmpty)
                    Button(recorder.isRecording ? "停止录音并上传" : "开始连续录音") {Task{await recorder.toggleRecording()}}
                        .disabled(recorder.isVADActive || coordinator.activeVisit.isEmpty)
                    Button("请求从其他设备接力到本机") {Task{await coordinator.requestHandoff()}}
                    Button("接力到Apple Watch") {Task{await recorder.handoffToWatch()}}
                    Text("接力会先停止原设备。看到授权释放后，再点开始监听；断开Mac时授权到期自动停止，不并行离线监听。").font(.caption).foregroundStyle(.secondary)
                    Text("待上传：\(recorder.queuedCount) · 已捕获：\(recorder.capturedSegments)")
                    Button("重试离线队列") {Task{await recorder.retryQueuedUploads()}}
                    Text(recorder.watchConnectionStatus).font(.caption)
                    Button("测试手表连接"){recorder.testWatchConnection()}
                }
                if let summary=model.data?.visit?.summary_json, !summary.isEmpty {
                    Section("拜访整合 · CRM候选待确认") {Text(summary).font(.footnote).textSelection(.enabled)}
                }
                Section("本次拜访片段") {
                    if (model.data?.clips ?? []).isEmpty {Text("尚无片段，不会生成示例客户或假记录")}
                    ForEach(model.data?.clips ?? []) {clip in
                        VStack(alignment:.leading,spacing:8) {
                            Text(clip.title ?? "片段 #\(clip.id)").font(.headline)
                            Text("转写：\(label(clip.transcription_status)) · 整理：\(label(clip.enrichment_status)) · 音频：\(label(clip.audio_status))").font(.caption)
                            if let text=clip.transcript {Text(text).textSelection(.enabled)}
                            if let summary=clip.summary {Text(summary).foregroundStyle(.secondary)}
                        }.padding(.vertical,4)
                    }
                }
                Section("使用边界") {Text("主动开启并取得在场者同意后使用。锁屏可继续，强制退出或系统中断不保证恢复。VAD减少保存与传输量，不代表已实测全天低功耗。只有转写、整理和文本归档成功才清理原音频；失败会保留。").font(.caption)}
            }
            .navigationTitle("TechBridge 拜访")
            .toolbar{Button("配对设置"){settings=true}}
            .sheet(isPresented:$settings){SettingsView()}
            .task{await model.refresh();if ProcessInfo.processInfo.arguments.contains("--opc-smoke-record") {await DeviceSmoke.run(recorder:recorder);await model.refresh()};while !Task.isCancelled {try? await Task.sleep(for:.seconds(10));if !Task.isCancelled {await model.refresh()}}}
        }
    }
}
