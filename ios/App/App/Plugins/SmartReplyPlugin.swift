import Foundation
import Capacitor
import MLKitSmartReply

@objc(SmartReplyPlugin)
public class SmartReplyPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier  = "SmartReplyPlugin"
    public let jsName      = "SmartReply"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "suggest", returnType: CAPPluginReturnPromise)
    ]

    private let smartReply = SmartReply.smartReply()

    @objc func suggest(_ call: CAPPluginCall) {
        guard let messagesArray = call.getArray("messages") else {
            call.reject("messages array is required")
            return
        }

        var conversation: [TextMessage] = []

        for item in messagesArray {
            guard
                let msg       = item as? [String: Any],
                let text      = msg["text"]      as? String,
                let isLocal   = msg["isLocal"]   as? Bool,
                let timestamp = msg["timestamp"] as? Double
            else { continue }

            let userId = msg["userId"] as? String ?? "remote_user"

            let message = TextMessage(
                text:        text,
                timestamp:   timestamp / 1000,   // JS uses ms, ML Kit uses seconds
                userID:      userId,
                isLocalUser: isLocal
            )
            conversation.append(message)
        }

        smartReply.suggestReplies(for: conversation) { [weak self] result, error in
            if let error = error {
                call.reject("Smart reply error: \(error.localizedDescription)")
                return
            }

            guard let result = result else {
                call.resolve(["suggestions": [], "status": "no_result"])
                return
            }

            switch result.status {
            case .success:
                let suggestions = result.suggestions.map { $0.text }
                call.resolve(["suggestions": suggestions, "status": "success"])

            case .notSupportedLanguage:
                call.resolve(["suggestions": [], "status": "unsupported_language"])

            default:
                call.resolve(["suggestions": [], "status": "no_reply"])
            }
        }
    }
}
