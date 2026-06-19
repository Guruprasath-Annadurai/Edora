import { registerPlugin, Capacitor } from '@capacitor/core';
import { geminiJSON } from '@/lib/gemini';

export interface SmartReplyMessage {
  text:      string;
  isLocal:   boolean;
  userId?:   string;
  timestamp: number;
}

export interface SmartReplyResult {
  suggestions: string[];
  status: 'success' | 'unsupported_language' | 'no_reply' | 'no_result';
}

export interface SmartReplyPlugin {
  suggest(options: { messages: SmartReplyMessage[] }): Promise<SmartReplyResult>;
}

// Register the native bridge — resolves to the Kotlin/Swift plugin on device
const NativeSmartReply = registerPlugin<SmartReplyPlugin>('SmartReply');

// ── Gemini-powered web fallback ───────────────────────────────────────────────
// Used when: running in browser, or native ML Kit returns no suggestions
// (ML Kit only works in English; Gemini handles all languages)
async function geminiSmartReply(messages: SmartReplyMessage[]): Promise<string[]> {
  const lastMessages = messages.slice(-4).map(m =>
    `${m.isLocal ? 'User' : 'Novo'}: ${m.text}`
  ).join('\n');

  try {
    return await geminiJSON<string[]>(
      `Given this conversation:\n${lastMessages}\n\nGenerate exactly 3 very short reply suggestions (max 6 words each) the user could send next. Return ONLY a JSON array of 3 strings, no explanation:\n["reply1","reply2","reply3"]`
    );
  } catch {
    return [];
  }
}

// ── Public API — auto-selects native or web fallback ─────────────────────────
export async function getSmartReplies(
  messages: SmartReplyMessage[]
): Promise<string[]> {
  // Only the last message must be from Nova (non-local)
  if (messages.length === 0) return [];
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.isLocal) return []; // Don't suggest after user's own message

  // Try native ML Kit first (Android + iOS on-device, no network needed)
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await NativeSmartReply.suggest({ messages });
      if (result.status === 'success' && result.suggestions.length > 0) {
        return result.suggestions;
      }
      // Falls through to Gemini if ML Kit returns nothing (e.g. non-English)
    } catch {
      // Native plugin unavailable — fall through
    }
  }

  // Web / fallback: use Gemini to generate suggestions
  return geminiSmartReply(messages);
}
