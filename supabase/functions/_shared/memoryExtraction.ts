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

// The production novo_memories.memory_type CHECK constraint (verified 2026-09-25) allows exactly these
// values, and the client (useNovoMemory) and novo-memory-extract use the same vocabulary.
// gemini-chat's extractor previously asked the model for a DIFFERENT vocabulary
// (struggle/strength/preference/milestone/exam_context), so almost every INSERT violated the
// CHECK, the error was never inspected, and novo_memories stayed at 0 rows (F6 root cause).
export const DB_MEMORY_TYPES = ['learning_pattern', 'academic_goal', 'personal_fact', 'emotion', 'achievement', 'fact'] as const;
export type DbMemoryType = typeof DB_MEMORY_TYPES[number];
export const DB_MEMORY_SOURCES = ['chat', 'sprint', 'quiz', 'tutoring', 'debate', 'system'] as const;

// Legacy vocabulary still produced by older prompts/models -> the DB vocabulary.
const LEGACY_TYPE_MAP: Record<string, DbMemoryType> = {
  struggle: 'learning_pattern', weakness: 'learning_pattern', strength: 'learning_pattern',
  preference: 'learning_pattern', pattern: 'learning_pattern',
  milestone: 'achievement',
  exam_context: 'academic_goal', schedule_request: 'academic_goal',
  note: 'fact',
};

/** Map any memory type (DB or legacy vocabulary) to a DB-valid one; null if it is not recognisable. */
export function toDbMemoryType(t: unknown): DbMemoryType | null {
  if (typeof t !== 'string') return null;
  const v = t.trim().toLowerCase();
  if ((DB_MEMORY_TYPES as readonly string[]).includes(v)) return v as DbMemoryType;
  return LEGACY_TYPE_MAP[v] ?? null;
}

export const VALID_MEMORY_TYPES = new Set<string>([...DB_MEMORY_TYPES, ...Object.keys(LEGACY_TYPE_MAP)]);

export function normalizeMemories(raw: unknown, userId: string): NormalizedMemoryRow[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawMemory[])
    .filter(m => m && m.content && toDbMemoryType(m.memory_type) !== null)
    .slice(0, 3)
    .map(m => ({
      user_id:     userId,
      memory_type: toDbMemoryType(m.memory_type) as string,
      content:     String(m.content).slice(0, 500),
      subject:     m.subject ?? null,
      topic:       m.topic ?? null,
      importance:  Math.max(1, Math.min(10, Number(m.importance) || 5)),
    }));
}

// ── Robust parsing of the extractor LLM's output ─────────────────────────────
/** Pull a JSON array out of model output that may include <think> blocks, code fences or prose. */
export function parseMemoryJson(raw: string): unknown[] | null {
  if (typeof raw !== 'string') return null;
  let t = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    const v = JSON.parse(t);
    if (Array.isArray(v)) return v;
  } catch { /* fall through to bracket scan */ }
  const a = t.indexOf('['); const b = t.lastIndexOf(']');
  if (a >= 0 && b > a) {
    try { const v = JSON.parse(t.slice(a, b + 1)); if (Array.isArray(v)) return v; } catch { /* unparseable */ }
  }
  return null;
}

// ── Extraction pipeline with an explicit outcome (never silently swallowed) ──
export type MemoryStage =
  | 'saved' | 'nothing_notable' | 'llm_http_error' | 'llm_exception' | 'empty_llm_output'
  | 'parse_failed' | 'no_valid_rows' | 'insert_failed';

export interface MemoryExtractionResult { stage: MemoryStage; saved: number; detail?: string }

export interface LlmReply { ok: boolean; status: number; text: string }

// Structural type so tests can pass a fake without the supabase-js dependency.
export interface MemoryDb {
  from(table: string): { insert(rows: unknown): PromiseLike<{ error: { code?: string; message?: string } | null }> };
}

export function buildExtractionPrompt(userMessage: string, assistantResponse: string, subject?: string): string {
  return `You are a memory extraction system for an AI tutor. Analyse this student-tutor exchange and extract 0–3 important memories to retain about the student.

STUDENT MESSAGE: "${userMessage.slice(0, 1000)}"
TUTOR RESPONSE: "${assistantResponse.slice(0, 800)}"
${subject ? `SUBJECT CONTEXT: ${subject}` : ''}

Extract only genuinely useful memories:
- Specific struggles or misconceptions, learning preferences and topics they find easy or hard -> learning_pattern
- Exams, targets, schedule -> academic_goal
- Personal facts relevant to studying -> personal_fact
- Emotional state affecting study -> emotion
- Achievements or breakthroughs -> achievement
- Other durable facts -> fact

Return ONLY a valid JSON array (empty array if nothing notable), no prose, no code fences:
[{"memory_type":"learning_pattern|academic_goal|personal_fact|emotion|achievement|fact","content":"concise 1-sentence memory","subject":"Physics|Chemistry|Mathematics|Biology|null","topic":"specific topic or null","importance":1-10}]

Rules: Only extract specific, useful memories. Max 3. No trivial small talk.`;
}

export async function extractMemories(args: {
  db: MemoryDb;
  userId: string;
  userMessage: string;
  assistantResponse: string;
  subject?: string;
  callLLM: (prompt: string) => Promise<LlmReply>;
  log?: (line: string) => void;
}): Promise<MemoryExtractionResult> {
  const log = args.log ?? ((l: string) => console.warn(l));
  const fail = (stage: MemoryStage, detail?: string): MemoryExtractionResult => {
    log(`[memory] ${stage}${detail ? ` — ${detail}` : ''}`);
    return { stage, saved: 0, detail };
  };
  let reply: LlmReply;
  try {
    reply = await args.callLLM(buildExtractionPrompt(args.userMessage, args.assistantResponse, args.subject));
  } catch (e) {
    return fail('llm_exception', (e as Error)?.message);
  }
  if (!reply.ok) return fail('llm_http_error', `HTTP ${reply.status}`);
  if (!reply.text || !reply.text.trim()) return fail('empty_llm_output');
  const parsed = parseMemoryJson(reply.text);
  if (parsed === null) return fail('parse_failed', reply.text.slice(0, 120));
  if (parsed.length === 0) return { stage: 'nothing_notable', saved: 0 };
  const rows = normalizeMemories(parsed, args.userId).map(m => ({
    ...m, source: 'chat', last_used_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return fail('no_valid_rows', `types=${parsed.map(p => (p as RawMemory)?.memory_type).join(',')}`);
  const { error } = await args.db.from('novo_memories').insert(rows);
  if (error) return fail('insert_failed', `${error.code ?? ''} ${error.message ?? ''}`.trim());
  log(`[memory] saved ${rows.length}`);
  return { stage: 'saved', saved: rows.length };
}

// ── Background work that is guaranteed to finish ─────────────────────────────
/** Register `p` with EdgeRuntime.waitUntil when available (Supabase Edge), otherwise just detach safely. */
export function runInBackground(p: Promise<unknown>): void {
  const safe = p.catch(e => console.error('[background] failed:', (e as Error)?.message ?? e));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt && typeof rt.waitUntil === 'function') rt.waitUntil(safe);
}
