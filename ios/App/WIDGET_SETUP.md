# Edora Home-Screen Widget — One-Time iOS Setup

The Swift source is ready in `ios/App/EdoraWidget/EdoraWidget.swift` and the
data-bridge plugin (`EdoraWidgetPlugin.swift`) is already wired into the main
app target. WidgetKit extensions require a real Xcode target — that part
can't be scripted safely, so do this once in Xcode:

## 1. Add the App Group (main app target)
1. Open `ios/App/App.xcodeproj` in Xcode.
2. Select the **App** target → **Signing & Capabilities** → **+ Capability** → **App Groups**.
3. Add group: `group.com.edora.app`

## 2. Create the Widget Extension target
1. **File → New → Target… → Widget Extension**.
2. Product Name: `EdoraWidget`. **Uncheck** "Include Configuration Intent" (this widget is static, not user-configurable).
3. Xcode generates a boilerplate `EdoraWidget.swift` in the new target's folder — **delete that generated file**.
4. Right-click the new `EdoraWidget` group in Xcode → **Add Files to "App"…** → select `ios/App/EdoraWidget/EdoraWidget.swift` → make sure **Target Membership** is checked for the `EdoraWidget` extension target only (not the main app).

## 3. Add the same App Group to the widget extension target
1. Select the **EdoraWidget** extension target → **Signing & Capabilities** → **+ Capability** → **App Groups**.
2. Add the **same** group: `group.com.edora.app`

## 4. Build & test
1. Select the `EdoraWidget` scheme and run on a simulator/device — Xcode will show the widget gallery.
2. Long-press the home screen → **+** → search "Edora" → add the widget.
3. Open the main Edora app once (the plugin writes streak + question data on `HomePage` load) — the widget refreshes immediately via `WidgetCenter.reloadAllTimelines()`.

## Notes
- `EdoraWidgetPlugin.swift` already fails soft (`call.resolve()` without writing) if the App Group isn't configured yet, so the main app keeps working even before you complete this setup.
- The widget falls back to a placeholder ("Open Edora to get today's question") if no data has been written yet.
- Bundle ID convention used throughout: `com.edora.app`. If you ever rename the app's bundle ID, update `appGroupID` in both `EdoraWidgetPlugin.swift` and `EdoraWidget.swift` to match.
