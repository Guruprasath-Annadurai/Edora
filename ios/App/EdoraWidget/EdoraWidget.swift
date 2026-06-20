import WidgetKit
import SwiftUI

// Must match EdoraWidgetPlugin.swift's appGroupID exactly.
private let appGroupID = "group.com.edora.app"
private let keyStreak    = "edora_widget_streak"
private let keyQuestion  = "edora_widget_question"
private let keyAnswered  = "edora_widget_answered"

// ── Timeline entry ────────────────────────────────────────────────────────────

struct EdoraWidgetEntry: TimelineEntry {
    let date: Date
    let streak: Int
    let question: String
    let answered: Bool
}

// ── Timeline provider — reads from the App Group shared with the main app ────

struct EdoraWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> EdoraWidgetEntry {
        EdoraWidgetEntry(date: Date(), streak: 7, question: "Practice Thermodynamics (Physics)", answered: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (EdoraWidgetEntry) -> Void) {
        completion(currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<EdoraWidgetEntry>) -> Void) {
        let entry = currentEntry()
        // Refresh hourly — the app also pushes an immediate reload via
        // WidgetCenter.reloadAllTimelines() whenever the data actually changes.
        let nextUpdate = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    private func currentEntry() -> EdoraWidgetEntry {
        let defaults = UserDefaults(suiteName: appGroupID)
        let streak   = defaults?.integer(forKey: keyStreak) ?? 0
        let question = defaults?.string(forKey: keyQuestion) ?? "Open Edora to get today's question"
        let answered = defaults?.bool(forKey: keyAnswered) ?? false
        return EdoraWidgetEntry(date: Date(), streak: streak, question: question, answered: answered)
    }
}

// ── View ───────────────────────────────────────────────────────────────────────

struct EdoraWidgetEntryView: View {
    var entry: EdoraWidgetEntry

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.10, green: 0.08, blue: 0.31), Color(red: 0.04, green: 0.05, blue: 0.12)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: "flame.fill")
                        .foregroundColor(Color(red: 0.98, green: 0.57, blue: 0.24))
                        .font(.system(size: 13))
                    Text("\(entry.streak)")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)
                    Text("day streak")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.7))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Color(red: 0.98, green: 0.57, blue: 0.24).opacity(0.15))
                .clipShape(Capsule())

                Text("TODAY'S QUESTION")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(Color(red: 0.55, green: 0.61, blue: 0.98))
                    .tracking(0.8)

                Text(entry.question)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)

                if entry.answered {
                    Text("✓ Answered today")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Color(red: 0.20, green: 0.83, blue: 0.60))
                }

                Spacer(minLength: 0)
            }
            .padding(16)
        }
        .widgetURL(URL(string: "com.edora.app://home"))
    }
}

// ── Widget declaration ────────────────────────────────────────────────────────

struct EdoraWidget: Widget {
    let kind: String = "EdoraWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: EdoraWidgetProvider()) { entry in
            EdoraWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Edora Streak")
        .description("Your streak count and today's question, right on your home screen.")
        .supportedFamilies([.systemMedium])
    }
}

@main
struct EdoraWidgetBundle: WidgetBundle {
    var body: some Widget {
        EdoraWidget()
    }
}
