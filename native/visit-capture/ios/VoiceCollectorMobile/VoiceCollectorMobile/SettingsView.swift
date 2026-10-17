import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var config = ServerConfig.shared
    @State private var testResult = ""
    @State private var testing = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Mac服务器") {
                    TextField("http://192.168.1.2:8765", text: $config.serverURL)
                        .textInputAutocapitalization(.never).keyboardType(.URL)
                    SecureField("上传Token", text: $config.token)
                        .textInputAutocapitalization(.never)
                    Button(testing ? "测试中…" : "测试连接") { Task { await test() } }.disabled(testing)
                    if !testResult.isEmpty { Text(testResult).foregroundStyle(testResult.hasPrefix("成功") ? .green : .red) }
                }
                Section("说明") {
                    Text("录音先保存在iPhone。上传成功后才会删除手机副本；断网时可稍后重试。Mac和iPhone需要连接同一个局域网。")
                }
            }
            .navigationTitle("设置")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } } }
        }
    }

    private func test() async {
        testing = true; testResult = ""
        do {
            try await UploadClient(serverURL: config.serverURL, token: config.token).health()
            testResult = "成功：已连接Mac"
        } catch { testResult = "失败：\(error.localizedDescription)" }
        testing = false
    }
}
