// Pure validation logic (and its supporting type) extracted out of index.ts
// so it can be unit tested without triggering index.ts's top-level serve()
// call.

export type PrereqGen = { prereqs?: Array<{ topic: string; why: string; class_level?: string }>; difficulty?: number };

// Basic structural check: prereqs must be an array of items shaped like
// { topic: string, why: string } — a malformed/truncated Groq response
// parses as JSON but can still fail this shape check.
export function validatePrereqGen(parsed: PrereqGen): boolean {
  if (!Array.isArray(parsed.prereqs)) return false;
  return parsed.prereqs.every(p =>
    p && typeof p.topic === 'string' && p.topic.trim().length > 0 &&
    typeof p.why === 'string' && p.why.trim().length > 0,
  );
}
