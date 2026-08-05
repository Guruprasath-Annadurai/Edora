// Pure validation logic extracted out of index.ts so it can be unit tested
// without triggering index.ts's top-level serve() call.

export interface TeacherNarrative { narrative: string; }

export function validateNarrative(n: unknown): string | null {
  if (typeof n !== 'string' || n.trim().length < 50) {
    return 'narrative missing or too short to be a real 3-paragraph report';
  }
  return null;
}
