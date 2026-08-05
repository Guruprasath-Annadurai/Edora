// Pure validation logic (and its supporting type) extracted out of index.ts
// so it can be unit tested without triggering index.ts's top-level
// Deno.serve() call.

export interface VideoAnalysis {
  summary:       string;
  key_concepts:  Array<{ concept: string; explanation: string }>;
  flashcards:    Array<{ front: string; back: string }>;
  topic_tags:    string[];
  difficulty:    'beginner' | 'intermediate' | 'advanced';
}

// ── Structural + semantic validator ────────────────────────────────────────
// Checks per-item field completeness plus the prompt's stated count ranges
// (5-10 key_concepts, 8-12 flashcards) — a response can be valid JSON with
// all top-level keys present yet still short-change a section or omit a
// per-item field.
export function validateVideoAnalysis(v: Partial<VideoAnalysis> | null | undefined): string | null {
  if (!v?.summary || typeof v.summary !== 'string') {
    return 'Missing or invalid "summary"';
  }
  if (!Array.isArray(v.key_concepts) || v.key_concepts.length < 5 || v.key_concepts.length > 10) {
    return `"key_concepts" must have 5-10 items, got ${Array.isArray(v.key_concepts) ? v.key_concepts.length : 'non-array'}`;
  }
  if (v.key_concepts.some(c => !c?.concept || !c?.explanation)) {
    return 'Every key_concepts item must have "concept" and "explanation"';
  }
  if (!Array.isArray(v.flashcards) || v.flashcards.length < 8 || v.flashcards.length > 12) {
    return `"flashcards" must have 8-12 items, got ${Array.isArray(v.flashcards) ? v.flashcards.length : 'non-array'}`;
  }
  if (v.flashcards.some(f => !f?.front || !f?.back)) {
    return 'Every flashcards item must have "front" and "back"';
  }
  return null;
}
