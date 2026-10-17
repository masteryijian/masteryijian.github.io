import Foundation
import Combine
import UIKit

struct CaptureReply: Decodable {
    let granted: Bool
    let owner: String?
    let token: String?
    let valid_for: Double
}
@MainActor final class CaptureCoordinator: ObservableObject {
    static let shared = CaptureCoordinator()
    @Published var status = "未占用录音设备"
    @Published var activeVisit = ""
    var onLost: (() -> Void)?
    private var token = ""
    private var deadline: TimeInterval = 0
    private var timer: Timer?
    private var busy = false
    private var generation = 0
    var deviceID: String { (UIDevice.current.userInterfaceIdiom == .pad ? "ipad-" : "iphone-") + (UIDevice.current.identifierForVendor?.uuidString ?? "unknown") }
    var valid: Bool { !token.isEmpty && ProcessInfo.processInfo.systemUptime < deadline }
    func request(_ path: String, body: [String: String]? = nil) async throws -> Data {
        let cfg=ServerConfig.shared
        guard let url=URL(string:cfg.serverURL)?.appending(path:path), !cfg.token.isEmpty else {throw UploadError.configuration}
        var req=URLRequest(url:url);req.timeoutInterval=6
        req.setValue("Bearer \(cfg.token)",forHTTPHeaderField:"Authorization")
        if let body {req.httpMethod="POST";req.setValue("application/json",forHTTPHeaderField:"Content-Type");req.httpBody=try JSONEncoder().encode(body)}
        let (data,response)=try await URLSession.shared.data(for:req)
        guard let http=response as? HTTPURLResponse,http.statusCode==200 else {throw UploadError.invalidResponse}
        return data
    }
    func command(_ action: String, owner: String? = nil, leaseToken: String? = nil) async throws -> CaptureReply {
        let data=try await request("api/mobile/lease",body:["action":action,"owner":owner ?? deviceID,"token":leaseToken ?? token])
        return try JSONDecoder().decode(CaptureReply.self,from:data)
    }
    func acquire() async -> Bool {
        if valid {return true}
        guard !busy else {return false};busy=true;defer{busy=false}
        let attempt=generation
        do {
            let start=ProcessInfo.processInfo.systemUptime
            let reply=try await command("acquire")
            guard reply.granted,let grantedToken=reply.token else {status="由 \(reply.owner ?? "其他设备") 监听；可请求接力";return false}
            if generation != attempt { _ = try? await command("release",leaseToken:grantedToken);return false }
            token=grantedToken;deadline=start+reply.valid_for-2
            guard valid else {await release();return false}
            status="本机已获得监听授权"
            timer?.invalidate()
            timer=Timer.scheduledTimer(withTimeInterval:1,repeats:true){[weak self] _ in Task{@MainActor in await self?.tick()}}
            return true
        } catch {status="Mac控制器不可达；为避免重复监听，未启动录音";return false}
    }
    private var lastRenew: TimeInterval = 0
    private func tick() async {
        if !valid {lose();return}
        let now=ProcessInfo.processInfo.systemUptime
        if busy || now-lastRenew<6{return}
        busy=true;lastRenew=now;defer{busy=false}
        let attempt=generation
        do {
            let reply=try await command("renew")
            guard attempt==generation else{return}
            if reply.granted {deadline=now+reply.valid_for-2}
            else {lose()}
        } catch {status="连接中断；授权到期前自动停止"}
    }
    private func lose() {
        timer?.invalidate();timer=nil
        status="授权失效或接力请求：已停止本机监听"
        onLost?()
        Task {await release()}
    }
    func stopLease() {
        let old=token;token="";deadline=0;generation+=1;timer?.invalidate();timer=nil
        if !old.isEmpty {Task {_ = try? await command("release",leaseToken:old)}}
    }
    func release() async {
        let old=token;token="";deadline=0;generation+=1;timer?.invalidate();timer=nil
        if !old.isEmpty {_ = try? await command("release",leaseToken:old)}
    }
    func requestHandoff() async {
        do {_ = try await command("request");status="已请求接力；原设备会先停止，再由本机获得授权"}
        catch {status="接力请求失败，原设备状态未知"}
    }
}
