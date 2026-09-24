// Pure validation logic extracted from index.ts so it's importable in tests
// without triggering index.ts's module-level serve() call.

// Semantic check on the parsed brief text before it's logged and pushed to
// the user's phone: a successful-but-empty Gemini response previously
// shipped straight through as a blank push notification. Also guards
// against a wildly-over-budget response (the prompt asks for 2 sentences /
// 120 chars) that would read as broken/truncated in a notification tray.
export function isValidBriefText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= 400;
}
