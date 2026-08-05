// Pure validation logic extracted out of index.ts so it can be unit tested
// without triggering index.ts's top-level serve() call.

// ── Structural validator for the generated plan's weeks ───────────────────────
// Gemini can return valid JSON that still fails to be a usable plan (missing
// chapters, wrong field types, a week dropped entirely). Checking that here
// lets the caller regenerate the whole plan instead of persisting garbage.
export function validateWeeks(weeks: unknown, expectedChapterCount: number): string | null {
  if (!Array.isArray(weeks) || weeks.length === 0) return '"weeks" must be a non-empty array';
  let totalChapters = 0;
  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i] as Partial<{ week: number; chapters: unknown[] }>;
    if (typeof w.week !== 'number') return `weeks[${i}]: missing "week" number`;
    if (!Array.isArray(w.chapters) || w.chapters.length === 0) {
      return `weeks[${i}]: "chapters" must be a non-empty array`;
    }
    for (let j = 0; j < w.chapters.length; j++) {
      const ch = w.chapters[j] as Partial<{
        id: string; subject: string; chapter: string; hours: number; priority: string; done: boolean;
      }>;
      if (!ch.id || typeof ch.id !== 'string') return `weeks[${i}].chapters[${j}]: missing "id"`;
      if (!ch.subject || typeof ch.subject !== 'string') return `weeks[${i}].chapters[${j}]: missing "subject"`;
      if (!ch.chapter || typeof ch.chapter !== 'string') return `weeks[${i}].chapters[${j}]: missing "chapter"`;
      if (typeof ch.hours !== 'number' || ch.hours <= 0) return `weeks[${i}].chapters[${j}]: "hours" must be a positive number`;
      if (!ch.priority || !['high', 'medium', 'low'].includes(ch.priority)) {
        return `weeks[${i}].chapters[${j}]: invalid "priority" "${ch.priority}"`;
      }
      if (typeof ch.done !== 'boolean') return `weeks[${i}].chapters[${j}]: "done" must be a boolean`;
      totalChapters++;
    }
  }
  if (totalChapters !== expectedChapterCount) {
    return `expected all ${expectedChapterCount} chapters distributed across weeks, got ${totalChapters}`;
  }
  return null;
}
