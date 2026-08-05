// Pure validation logic (and its supporting type) extracted out of index.ts
// so it can be unit tested without triggering index.ts's top-level serve()
// call.

export interface ConceptExtract { concept: string; }

// Validate the extracted concept before trusting it — a response can
// parse as JSON but still have an empty/missing "concept" field. That
// used to be silently swallowed via .catch(() => null) on the very
// first hiccup; now the whole extract+validate cycle gets a couple of
// retries before falling back to null.
export function validateConcept(c: ConceptExtract | null): string | null {
  if (!c) return 'No extraction result';
  if (!c.concept || typeof c.concept !== 'string' || c.concept.trim().length === 0) {
    return 'Missing or empty "concept"';
  }
  return null;
}
