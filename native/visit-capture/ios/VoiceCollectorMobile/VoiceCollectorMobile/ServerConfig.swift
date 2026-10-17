import Combine
import Foundation
import Security

@MainActor
final class ServerConfig: ObservableObject {
    static let shared = ServerConfig()
    @Published var serverURL: String {
        didSet { UserDefaults.standard.set(serverURL, forKey: "serverURL") }
    }
    @Published var token: String {
        didSet { Keychain.save(token, account: "uploadToken") }
    }

    private init() {
        serverURL = UserDefaults.standard.string(forKey: "serverURL") ?? "http://192.168.1.2:8765"
        token = Keychain.load(account: "uploadToken") ?? ""
        let file=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent("Pairing.json")
        if let raw=try? Data(contentsOf:file), let pair=try? JSONDecoder().decode([String:String].self,from:raw),let address=pair["serverURL"],let secret=pair["token"] {
            serverURL=address;token=secret
            UserDefaults.standard.set(address,forKey:"serverURL");Keychain.save(secret,account:"uploadToken")
            try? FileManager.default.removeItem(at:file)
        }
    }
}

enum Keychain {
    private static let service = "com.yijian.voicecollector"

    static func save(_ value: String, account: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service,
                                    kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
        var item = query
        item[kSecValueData as String] = data
        SecItemAdd(item as CFDictionary, nil)
    }

    static func load(account: String) -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service,
                                    kSecAttrAccount as String: account,
                                    kSecReturnData as String: true,
                                    kSecMatchLimit as String: kSecMatchLimitOne]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
