import Foundation
import UIKit
@MainActor enum DeviceSmoke {
    static func write(_ value: [String:String]) {
        let folder=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0]
        var record=value;record["time"]=ISO8601DateFormatter().string(from:Date())
        if let data=try? JSONEncoder().encode(record) {try? data.write(to:folder.appendingPathComponent("DeviceSmoke.json"),options:.atomic)}
    }
    static func screenshot() {
        guard let scene=UIApplication.shared.connectedScenes.first as? UIWindowScene,let window=scene.windows.first(where:{$0.isKeyWindow}) else{return}
        let image=UIGraphicsImageRenderer(bounds:window.bounds).image{_ in window.drawHierarchy(in:window.bounds,afterScreenUpdates:true)}
        let folder=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0]
        try? image.pngData()?.write(to:folder.appendingPathComponent("DeviceSmoke.png"),options:.atomic)
    }
    static func run(recorder: RecorderModel) async {
        do {
            let raw=try await CaptureCoordinator.shared.request("api/mobile/visits",body:["customer":"iPhone实机联调（非真实客户）","focus":"连接、15秒录音、上传、Qwen转写与本地整理验收"])
            let created=try JSONDecoder().decode([String:String].self,from:raw)
            CaptureCoordinator.shared.activeVisit=created["id"] ?? ""
            write(["phase":"starting_recording"])
            await recorder.toggleRecording()
            guard recorder.isRecording else {write(["phase":"recording_failed","status":recorder.status]);screenshot();return}
            write(["phase":"recording","status":recorder.status])
            try? await Task.sleep(for:.seconds(15))
            if recorder.isRecording {await recorder.toggleRecording()}
            try? await Task.sleep(for:.seconds(5))
            write(["phase":"recording_finished","status":recorder.status,"queued":String(recorder.queuedCount)])
            screenshot()
        } catch {write(["phase":"failed","error":error.localizedDescription]);screenshot()}
    }
}
