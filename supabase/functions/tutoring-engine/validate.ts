// Pure validation logic (and its supporting types) extracted out of index.ts
// so it can be unit tested without triggering index.ts's top-level serve()
// call. These were previously inline arrow functions + local interfaces
// defined inside handleStart / handleRequestCheckpoint — hoisted here
// unchanged.

export interface SessionStructure {
  objectives:      string[];
  concepts:        Array<{ title: string }>;
  intro_message:   string;
  first_teaching:  string;
}

// This structural check used to run only after a single callGeminiJSON
// attempt, so a bad response failed straight out to the student instead of
// triggering another generation attempt. Passing it as validateFn wires it
// into callGeminiJSON's own retry loop, so a structurally-invalid response
// now regenerates (with backoff) before giving up.
export const validateStructure = (v: SessionStructure) =>
  !!v && Array.isArray(v.objectives) && Array.isArray(v.concepts) &&
  !!v.intro_message && !!v.first_teaching;

export interface CheckpointQ {
  question:    string;
  options:     string[];
  correct_idx: number;
  explanation: string;
}

// Same fix as handleStart: this structural check used to run only after a
// single callGeminiJSON attempt (one-shot failure straight to the
// student). Wiring it into validateFn lets callGeminiJSON's existing
// retry loop regenerate the checkpoint on a bad response.
export const validateCheckpoint = (v: CheckpointQ) =>
  !!v && !!v.question && Array.isArray(v.options) && v.options.length === 4 &&
  typeof v.correct_idx === 'number' && v.correct_idx >= 0 && v.correct_idx <= 3;
