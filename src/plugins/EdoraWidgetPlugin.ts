import { registerPlugin, Capacitor } from '@capacitor/core';

export interface EdoraWidgetData {
  streakCount: number;
  todayQuestion: string;
  todayAnswered: boolean;
  xpToday?: number;
  xpGoal?: number;
  nextCardMin?: number;     // minutes until next flashcard is due (0 = due now)
  examName?: string;        // e.g. "JEE Mains"
  examDays?: number;        // days until exam
  novoTip?: string;         // short tip/message shown in full Novo widget
}

export interface EdoraWidgetPlugin {
  /** Writes widget data to native shared storage and requests a widget refresh */
  updateWidget(options: EdoraWidgetData): Promise<void>;
}

// Native bridge — resolves to the Kotlin (Android) / Swift (iOS) plugin on device.
// No-ops safely on web (registerPlugin returns a stub when no native impl exists).
const NativeEdoraWidget = registerPlugin<EdoraWidgetPlugin>('EdoraWidget');

/**
 * Push the latest streak count + today's question to the home-screen widget.
 * Call this whenever either value changes: after streak tick, after the
 * daily question is fetched/answered, and once on app foreground.
 * Safe to call on web/dev — silently no-ops there.
 */
export async function updateHomeWidget(data: EdoraWidgetData): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeEdoraWidget.updateWidget(data);
  } catch {
    // Widget plugin unavailable (e.g. older app build mid-rollout) — non-fatal
  }
}
