// Pure validation/normalization logic for LLM-extracted student memories.
// Extracted from gemini-chat/index.ts so it can be unit tested without
// spinning up Deno.serve or hitting the Groq API.

export interface RawMemory {
  memory_type: string;
  content:     string;
  subject?:    string;
  topic?:      string;
  importance?: number;
}

export interface NormalizedMemoryRow {
  user_id:     string;
  memory_type: string;
  content:     string;
  subject:     string | null;
  topic:       string | null;
  importance:  number;
}

export const VALID_MEMORY_TYPES = new Set([
  'struggle', 'strength', 'preference', 'milestone',
  'emotion', 'achievement', 'fact', 'exam_context', 'pattern',
]);

export function normalizeMemories(raw: unknown, userId: string): NormalizedMemoryRow[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawMemory[])
    .filter(m => m && m.content && VALID_MEMORY_TYPES.has(m.memory_type))
    .slice(0, 3)
    .map(m => ({
      user_id:     userId,
      memory_type: m.memory_type,
      content:     String(m.content).slice(0, 500),
      subject:     m.subject ?? null,
      topic:       m.topic ?? null,
      importance:  Math.max(1, Math.min(10, Number(m.importance) || 5)),
    }));
}
