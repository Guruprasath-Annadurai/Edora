import Foundation
import Capacitor
import WidgetKit

// Shared App Group container — lets the WidgetKit extension (a separate
// process) read what the main app writes. Must match the App Group ID
// configured in both targets' Signing & Capabilities (see WIDGET_SETUP.md).
private let appGroupID = "group.com.edora.app"

public let edoraWidgetKeyStreak    = "edora_widget_streak"
public let edoraWidgetKeyQuestion  = "edora_widget_question"
public let edoraWidgetKeyAnswered  = "edora_widget_answered"

@objc(EdoraWidgetPlugin)
public class EdoraWidgetPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier  = "EdoraWidgetPlugin"
    public let jsName      = "EdoraWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateWidget", returnType: CAPPluginReturnPromise)
    ]

    @objc func updateWidget(_ call: CAPPluginCall) {
        let streak   = call.getInt("streakCount") ?? 0
        let question = call.getString("todayQuestion") ?? ""
        let answered = call.getBool("todayAnswered") ?? false

        guard let defaults = UserDefaults(suiteName: appGroupID) else {
            // App Group not configured yet (one-time Xcode setup step) — fail soft
            call.resolve()
            return
        }

        defaults.set(streak, forKey: edoraWidgetKeyStreak)
        defaults.set(question, forKey: edoraWidgetKeyQuestion)
        defaults.set(answered, forKey: edoraWidgetKeyAnswered)

        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        call.resolve()
    }
}
