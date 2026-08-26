// Pure validation logic extracted from index.ts so it's importable in tests
// without triggering index.ts's module-level Deno.serve() call.

// Semantic check on the parsed merge result before it's trusted into
// novo_memories.content: must be non-empty, and not wildly over the
// requested 150-char budget (a garbled/truncated completion — e.g. the
// model ignoring the length instruction or echoing the whole prompt back —
// is worse than just keeping the original first memory).
export function isValidMergedSummary(text: string | undefined | null): text is string {
  return !!text && text.trim().length > 0 && text.trim().length <= 400;
}
