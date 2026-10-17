import Foundation
import UserNotifications
import WatchConnectivity

final class PhoneWatchConnectivity: NSObject, WCSessionDelegate {
    static let shared = PhoneWatchConnectivity()

    var onHandoffRequested: ((String, String, @escaping (Bool) -> Void) -> Void)?
    var onWatchFileReceived: (() -> Void)?
    var onConnectionChanged: ((String) -> Void)?
    private var pendingHandoffSessionID: String?
    private let pendingHandoffKey = "pendingWatchHandoffSessionID"
    private let pendingHandoffModeKey = "pendingWatchHandoffMode"

    private override init() { super.init() }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    func requestWatchCapture() async -> Bool {
        guard WCSession.default.isReachable else {return false}
        return await withCheckedContinuation { continuation in
            WCSession.default.sendMessage(["command":"startCapture","mode":"vad"],replyHandler:{reply in continuation.resume(returning:reply["started"] as? Bool == true)},errorHandler:{_ in continuation.resume(returning:false)})
        }
    }
    func testWatchConnection(completion: @escaping (String) -> Void) {
        guard WCSession.isSupported() else { completion("此设备不支持Watch连接"); return }
        let session = WCSession.default
        guard session.activationState == .activated else { completion("Watch连接尚未激活"); return }
        guard session.isPaired else { completion("没有配对的Apple Watch"); return }
        guard session.isWatchAppInstalled else { completion("Watch App尚未安装"); return }
        guard session.isReachable else { completion("Watch当前不可达，但文件仍可后台排队"); return }
        session.sendMessage(["command": "ping"], replyHandler: { response in
            DispatchQueue.main.async { completion(response["ok"] as? Bool == true ? "Watch通信正常" : "Watch响应异常") }
        }, errorHandler: { error in
            DispatchQueue.main.async { completion("Watch通信失败：\(error.localizedDescription)") }
        })
    }

    func completePendingHandoffIfNeeded() -> (String, String)? {
        let value = pendingHandoffSessionID ?? UserDefaults.standard.string(forKey: pendingHandoffKey)
        let mode = UserDefaults.standard.string(forKey: pendingHandoffModeKey) ?? "continuous"
        pendingHandoffSessionID = nil
        UserDefaults.standard.removeObject(forKey: pendingHandoffKey)
        UserDefaults.standard.removeObject(forKey: pendingHandoffModeKey)
        return value.map { ($0, mode) }
    }

    func tellWatchHandoffStarted(sessionID: String) {
        guard WCSession.default.activationState == .activated else { return }
        WCSession.default.transferUserInfo(["command": "handoffStarted", "sessionID": sessionID])
    }

    private func requestHandoff(sessionID: String, mode: String, reply: @escaping (Bool) -> Void) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { reply(false); return }
            if let handler = self.onHandoffRequested {
                handler(sessionID, mode) { [weak self] started in
                    if !started {
                        self?.pendingHandoffSessionID = sessionID
                        UserDefaults.standard.set(sessionID, forKey: self?.pendingHandoffKey ?? "pendingWatchHandoffSessionID")
                        UserDefaults.standard.set(mode, forKey: self?.pendingHandoffModeKey ?? "pendingWatchHandoffMode")
                        self?.notifyHandoffRequired()
                    }
                    reply(started)
                }
            } else {
                self.pendingHandoffSessionID = sessionID
                UserDefaults.standard.set(sessionID, forKey: self.pendingHandoffKey)
                UserDefaults.standard.set(mode, forKey: self.pendingHandoffModeKey)
                self.notifyHandoffRequired()
                reply(false)
            }
        }
    }

    private func notifyHandoffRequired() {
        let content = UNMutableNotificationContent()
        content.title = "手表电量低"
        content.body = "轻点立即让iPhone接力录音"
        content.sound = .default
        content.userInfo = ["voiceCollectorCommand": "watchHandoff"]
        UNUserNotificationCenter.current().add(UNNotificationRequest(
            identifier: "voicecollector-watch-handoff",
            content: content,
            trigger: nil
        ))
    }

    private func acceptWatchFile(_ temporaryURL: URL, metadata: [String: Any]?) {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let queue = documents.appending(path: "UploadQueue", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: queue, withIntermediateDirectories: true)
        let timestamp = metadata?["recordedAtMS"] as? Int64 ?? Int64(Date().timeIntervalSince1970 * 1000)
        let duration = metadata?["durationMS"] as? Int ?? 1000
        let sessionID = metadata?["sessionID"] as? String ?? UUID().uuidString
        let ext = (metadata?["fileExtension"] as? String) == "caf" ? "caf" : "m4a"
        let target = queue.appending(path: "watch-\(timestamp)-\(duration)-\(sessionID).\(ext)")
        do {
            if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
            try FileManager.default.moveItem(at: temporaryURL, to: target)
            let visit = metadata?["visitID"] as? String ?? ""
            try? Data(visit.utf8).write(to:target.appendingPathExtension("visit"),options:.atomic)
            WCSession.default.transferUserInfo(["command":"fileDurable","filename":target.lastPathComponent])
            DispatchQueue.main.async { [weak self] in self?.onWatchFileReceived?() }
        } catch {
            NSLog("Unable to queue Watch recording: %@", error.localizedDescription)
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        DispatchQueue.main.async { [weak self] in
            self?.onConnectionChanged?(error == nil ? "Watch连接已激活" : "Watch连接失败")
        }
    }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { [weak self] in
            self?.onConnectionChanged?(session.isReachable ? "Watch已连接" : "Watch不可达，可后台排队")
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any],
                 replyHandler: @escaping ([String: Any]) -> Void) {
        if message["command"] as? String == "captureLease" {
            Task { @MainActor in
                do {
                    let coordinator=CaptureCoordinator.shared
                    let raw=try await coordinator.request("api/mobile/lease",body:["action":message["action"] as? String ?? "status","owner":"watch-"+coordinator.deviceID,"token":message["token"] as? String ?? ""])
                    var value=(try JSONSerialization.jsonObject(with:raw) as? [String:Any]) ?? [:]
                    value["visitID"]=coordinator.activeVisit
                    replyHandler(value)
                } catch {replyHandler(["granted":false])}
            }
            return
        }
        if message["command"] as? String == "ping" {
            replyHandler(["ok": true, "time": Date().timeIntervalSince1970]); return
        }
        guard message["command"] as? String == "handoff",
              let sessionID = message["sessionID"] as? String else {
            replyHandler(["started": false]); return
        }
        let mode = message["mode"] as? String ?? "continuous"
        requestHandoff(sessionID: sessionID, mode: mode) { started in replyHandler(["started": started]) }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard userInfo["command"] as? String == "handoff",
              let sessionID = userInfo["sessionID"] as? String else { return }
        let mode = userInfo["mode"] as? String ?? "continuous"
        pendingHandoffSessionID = sessionID
        UserDefaults.standard.set(sessionID, forKey: pendingHandoffKey)
        UserDefaults.standard.set(mode, forKey: pendingHandoffModeKey)
        notifyHandoffRequired()
        requestHandoff(sessionID: sessionID, mode: mode) { _ in }
    }

    func session(_ session: WCSession, didReceive file: WCSessionFile) {
        acceptWatchFile(file.fileURL, metadata: file.metadata)
    }
}
