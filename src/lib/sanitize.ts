// ─────────────────────────────────────────────────────────────────────────────
// sanitize — client-side input sanitization utilities
// Use before sending any user-provided text to AI or storing in DB
// ─────────────────────────────────────────────────────────────────────────────

// Strip HTML tags and null bytes, enforce length cap
export function sanitizeText(input: string, maxLength = 2000): string {
  return input
    .replace(/<[^>]*>/g, '')
    // eslint-disable-next-line no-control-regex -- intentional: strip null bytes
    .replace(/\x00/g, '')
    .slice(0, maxLength)
    .trim();
}

// Sanitize before injecting into any prompt
export function sanitizePromptInput(input: string): string {
  return sanitizeText(input, 4000)
    .replace(/```/g, "'''")   // prevent code fence injection into structured prompts
    .replace(/\[\[/g, '[')    // neutralise template injection syntax
    .replace(/\]\]/g, ']');
}

// Sanitize an array of strings (e.g. tags, options)
export function sanitizeStringArray(arr: unknown, maxItems = 20, itemMax = 500): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .slice(0, maxItems)
    .filter((x): x is string => typeof x === 'string')
    .map(s => sanitizeText(s, itemMax));
}

// Sanitize a topic/subject name — alphanumeric + common punctuation only
export function sanitizeTopic(input: string): string {
  return sanitizeText(input, 200).replace(/[^a-zA-Z0-9\s\-_().,'&]/g, '');
}
