// Pure validation logic (and its supporting types) extracted out of index.ts
// so it can be unit tested without triggering index.ts's top-level serve()
// call.

export const VALID_TYPES = new Set(['struggle', 'strength', 'preference', 'milestone', 'pattern', 'exam_context']);

export type MemoryExtract = {
  memory_type: string; content: string; subject: string | null;
  topic: string | null; importance: number;
};
export type SessionSummaryExtract = {
  summary: string; struggles: string[]; wins: string[];
  explanation_style: string | null;
};
export type ExtractionResult = {
  memories: MemoryExtract[];
  session_summary: SessionSummaryExtract;
};

// Validate the shape of an extraction before trusting it. A response can
// parse as valid JSON but still contain memories with missing content/type
// or an empty session summary — that used to be silently filtered/dropped
// rather than triggering a fresh extraction attempt.
export function validateExtraction(candidate: ExtractionResult | null): string | null {
  if (!candidate) return 'No extraction result';
  if (!Array.isArray(candidate.memories)) return '"memories" must be an array';
  for (let i = 0; i < candidate.memories.length; i++) {
    const m = candidate.memories[i];
    if (!m || typeof m.content !== 'string' || m.content.trim().length === 0) {
      return `memories[${i}]: missing or empty "content"`;
    }
    if (!m.memory_type || !VALID_TYPES.has(m.memory_type)) {
      return `memories[${i}]: invalid "memory_type" "${m?.memory_type}"`;
    }
  }
  const ss = candidate.session_summary;
  if (!ss || typeof ss.summary !== 'string' || ss.summary.trim().length === 0) {
    return '"session_summary.summary" is missing or empty';
  }
  return null;
}
