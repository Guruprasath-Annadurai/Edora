// ai_generation_enabled enforcement at the client's single Edge-Function choke point.
//
// Route-level gating (GatedOutlet) is not enough: generation actions also live inside screens that stay
// reachable (Chat quick actions, Flashcards "Generate with AI", Home cards, Scanner, ...). Instead of patching
// ~110 call sites, every supabase.functions.invoke() to an AI *generation* function is refused here BEFORE any
// network request when the flag is off. Deterministic/non-AI functions (memory, subscription, push, analytics)
// are never touched. The Novo conversation itself is governed by novo_enabled, not this flag.
//
// This module deliberately does NOT import appFlags (which imports the supabase client, which imports this):
// AppFlagsProvider pushes the live value in through setAiGenerationEnabled().

export const AI_PAUSED_MESSAGE = 'AI generation is temporarily paused. Your saved practice and review still work.';

export class AiGenerationPausedError extends Error {
  readonly code = 'ai_generation_paused';
  constructor() { super(AI_PAUSED_MESSAGE); this.name = 'AiGenerationPausedError'; }
}

/** Edge functions whose job is to call an LLM to produce/explain/evaluate content. */
export const GENERATION_FUNCTIONS: ReadonlySet<string> = new Set([
  'gemini-chat',            // non-streaming content generation (quiz intent, geminiCall/geminiJSON helpers)
  'gemini-vision', 'ai-question-gen', 'study-pack-generator', 'roadmap-generator', 'lesson-planner',
  'revision-planner', 'question-explain', 'novo-daily-session', 'novo-challenges', 'debate-mode',
  'story-mode', 'boss-fight', 'tutoring-engine', 'exam-prediction', 'video-companion', 'curriculum-builder',
  'mains-answer-evaluator', 'novo-certifications', 'novo-language', 'novo-proactive', 'novo-insights',
  'mistake-clustering',
]);

let enabled = true;   // matches the SDK default; AppFlagsProvider keeps it current
export const setAiGenerationEnabled = (v: boolean): void => { enabled = v; };
export const isAiGenerationEnabled = (): boolean => enabled;

interface FunctionsLike {
  invoke: (name: string, options?: unknown) => Promise<{ data: unknown; error: unknown }>;
}

/** Replace `functions.invoke` with a guarded version (idempotent). Returns the same object. */
export function guardFunctionsInvoke<T extends FunctionsLike>(functions: T, isEnabled: () => boolean = isAiGenerationEnabled): T {
  const original = functions.invoke.bind(functions);
  functions.invoke = (name: string, options?: unknown) => {
    if (GENERATION_FUNCTIONS.has(name) && !isEnabled()) {
      return Promise.resolve({ data: null, error: new AiGenerationPausedError() });
    }
    return original(name, options);
  };
  return functions;
}
