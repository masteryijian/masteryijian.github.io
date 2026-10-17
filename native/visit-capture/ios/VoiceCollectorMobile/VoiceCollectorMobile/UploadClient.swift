import Foundation

enum UploadError: LocalizedError {
    case configuration, invalidResponse, server(Int, String)
    var errorDescription: String? {
        switch self {
        case .configuration: return "请先设置Mac地址和上传Token"
        case .invalidResponse: return "服务器响应无效"
        case let .server(code, text): return "服务器错误 \(code)：\(text)"
        }
    }
}

struct UploadClient {
    let serverURL: String
    let token: String

    func health() async throws {
        guard let url = URL(string: serverURL)?.appending(path: "api/mobile/health"), !token.isEmpty else {
            throw UploadError.configuration
        }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 10
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw UploadError.invalidResponse }
        guard http.statusCode == 200 else { throw UploadError.server(http.statusCode, "连接测试失败") }
    }

    func upload(file: URL, recordedAt: Date, durationMS: Int, deviceID: String, visitID: String = "") async throws {
        guard let url = URL(string: serverURL)?.appending(path: "api/mobile/upload"), !token.isEmpty else {
            throw UploadError.configuration
        }
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        func field(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
        }
        field("recorded_at", ISO8601DateFormatter().string(from: recordedAt))
        field("duration_ms", String(durationMS))
        field("device_id", deviceID)
        field("visit_id", visitID)
        let mime = file.pathExtension.lowercased() == "caf" ? "audio/x-caf" : "audio/mp4"
        body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"\(file.lastPathComponent)\"\r\nContent-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
        body.append(try Data(contentsOf: file))
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 180
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw UploadError.invalidResponse }
        guard http.statusCode == 200 else {
            throw UploadError.server(http.statusCode, "上传失败")
        }
        guard let receipt=try JSONSerialization.jsonObject(with:data) as? [String:Any],receipt["ok"] as? Bool == true, receipt["clip_id"] is NSNumber else {throw UploadError.invalidResponse}
    }
}
