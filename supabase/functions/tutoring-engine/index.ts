// ═══════════════════════════════════════════════════════════════
// Edora — tutoring-engine Edge Function
//
// Manages all AI interactions for structured Novo tutoring sessions.
//
// Actions:
//   start            — create session, generate objectives + concepts + intro
//   message          — student message during teaching phase (Novo responds)
//   request_checkpoint — student ready to be tested on current concept
//   submit_answer    — student submits MCQ answer index
//
// State machine per session:
//   intro → teaching → checkpoint → (next concept teaching | complete)
//
// Security:
//   - JWT verified per request (auth.uid() extracted from Bearer token)
//   - correct_idx is NEVER returned to the client — stored in DB only
//   - Service-role key used for DB writes; client key for reads where RLS applies
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';

import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
// ── CORS ─────────────────────────────────────────────────────────────────────

// ── AI provider chain ─────────────────────────────────────────────────────────
// Primary: Groq (generous free-tier TPM, fast). Falls back to a smaller Groq
// model on rate-limit, then to Gemini as a last resort if both Groq models are
// exhausted. Mirrors the resilience pattern already proven in gemini-chat —
// function names kept as callGemini/callGeminiJSON so none of this file's
// call sites need to change.
const GROQ_KEY            = Deno.env.get('GROQ_API_KEY') ?? '';
const GROQ_URL             = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL_PRIMARY   = 'llama-3.3-70b-versatile';
const GROQ_MODEL_FALLBACK  = 'llama-3.1-8b-instant';

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

interface GeminiTurn { role: 'user' | 'model'; parts: Array<{ text: string }> }

function toGroqMessages(systemPrompt: string, history: GeminiTurn[], userMessage: string) {
  return [
    { role: 'system' as const, content: systemPrompt },
    ...history.map(h => ({
      role:    h.role === 'model' ? 'assistant' as const : 'user' as const,
      content: h.parts.map(p => p.text).join('\n'),
    })),
    { role: 'user' as const, content: userMessage },
  ];
}

async function callGroq(
  model: string,
  systemPrompt: string,
  history: GeminiTurn[],
  userMessage: string,
  jsonMode: boolean,
  temperature: number,
): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model,
      messages:    toGroqMessages(systemPrompt, history, userMessage),
      temperature,
      max_tokens:  jsonMode ? 1024 : 2048,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${model} ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGeminiRaw(
  systemPrompt: string,
  history: GeminiTurn[],
  userMessage: string,
  jsonMode: boolean,
  temperature: number,
): Promise<string> {
  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [...history, { role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: jsonMode ? 1024 : 2048,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const res = await fetch(GEMINI_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callGemini(
  systemPrompt: string,
  history: GeminiTurn[],
  userMessage: string,
  jsonMode = false,
  temperature = 0.7,
): Promise<string> {
  if (GROQ_KEY) {
    try {
      return await callGroq(GROQ_MODEL_PRIMARY, systemPrompt, history, userMessage, jsonMode, temperature);
    } catch (primaryErr) {
      console.warn('[tutoring-engine] Groq primary failed, trying fallback model:', (primaryErr as Error).message);
      try {
        return await callGroq(GROQ_MODEL_FALLBACK, systemPrompt, history, userMessage, jsonMode, temperature);
      } catch (fallbackErr) {
        console.warn('[tutoring-engine] Groq fallback failed, falling back to Gemini:', (fallbackErr as Error).message);
      }
    }
  }
  return callGeminiRaw(systemPrompt, history, userMessage, jsonMode, temperature);
}

async function callGeminiJSON<T>(
  systemPrompt: string,
  history: GeminiTurn[],
  userMessage: string,
): Promise<T> {
  const raw = await callGemini(systemPrompt, history, userMessage, true, 0.3);
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  return JSON.parse(cleaned) as T;
}

// ── Soft error (200 so data is populated on client) ───────────────────────────
function softError(error: string, code: string) {
  return new Response(JSON.stringify({ error, code }), {
    status:  200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function ok(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status:  200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Adaptive difficulty: Wilson lower-bound estimate ──────────────────────────
function computeDifficulty(mastery: {
  difficulty_level: number;
  mastery_score: number;
  consecutive_correct: number;
  consecutive_wrong: number;
}): 1 | 2 | 3 | 4 | 5 {
  const { difficulty_level, mastery_score, consecutive_correct, consecutive_wrong } = mastery;
  if (consecutive_correct >= 3 && mastery_score >= 0.8) return Math.min(5, difficulty_level + 1) as any;
  if (consecutive_wrong  >= 2 || mastery_score  < 0.35) return Math.max(1, difficulty_level - 1) as any;
  return difficulty_level as any;
}

const DIFFICULTY_LABELS = ['', 'Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate'];

// ── System prompts ────────────────────────────────────────────────────────────
function buildSystemPrompt(
  mode: 'standard' | 'socratic' | 'drill',
  subject: string,
  studyLevel: string,
  errorContext?: string,
): string {
  const level = studyLevel === 'school' ? 'a school student' :
                studyLevel === 'college' ? 'a college student' :
                studyLevel === 'competitive' ? 'a competitive exam student' : 'a professional';

  if (mode === 'socratic') {
    return `You are Novo, a Socratic AI tutor inside the Edora learning app. You are tutoring ${level} in ${subject}.

CRITICAL RULE: You NEVER directly explain, state facts, or give answers. You ONLY ask carefully sequenced questions that guide the student to discover the answer themselves.

Socratic method:
1. Start by probing prior knowledge ("What do you already know about X?")
2. When the student answers, acknowledge what's correct and follow up ("Interesting — and what happens when Y changes?")
3. If stuck, offer the smallest possible hint as a question ("What is the formula that relates F, m, and a?")
4. Build on each response until the student has articulated the full concept themselves
5. Celebrate when they get it: "Exactly! You've just derived Newton's Second Law."

Keep responses SHORT (2-4 sentences max). One question per message. Never use bullet lists.`;
  }

  if (mode === 'drill') {
    return `You are Novo, an AI tutor running a targeted remediation drill inside the Edora learning app. You are helping ${level} fix a specific recurring mistake in ${subject}.

Error pattern: ${errorContext ?? 'general'}

Your goal: help the student understand WHY they keep making this mistake and practise until it's corrected.
- Explain the correct concept with a clear example
- Walk through a worked example step-by-step
- Ask the student to reproduce the reasoning
- Be encouraging — frame errors as learning opportunities, not failures
- Keep explanations focused and concise`;
  }

  return `You are Novo, an expert AI tutor inside the Edora learning app. You are tutoring ${level} in ${subject}.

Teaching principles:
- Be warm, encouraging, and rigorous
- Use concrete examples and real-world analogies before abstract definitions
- Structure explanations: hook → core concept → worked example → summary
- Use markdown formatting (bold key terms, numbered steps for processes)
- Keep each teaching segment digestible (aim for 150-250 words)
- If the student asks a question, answer it directly and check if that clarifies things

You are NOT a chatbot — you are a structured tutor with a lesson plan. Stay on topic.`;
}

// ── History builder ───────────────────────────────────────────────────────────
interface DBMessage { role: 'novo' | 'student'; content: string }

function buildHistory(messages: DBMessage[]): GeminiTurn[] {
  return messages.map(m => ({
    role:  m.role === 'novo' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

// ── Supabase clients ──────────────────────────────────────────────────────────
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ════════════════════════════════════════════════════════════════
// ACTION: start
// ════════════════════════════════════════════════════════════════
async function handleStart(body: Record<string, unknown>, userId: string) {
  const { subject, topic, mode = 'standard', study_level = 'school', drill_pattern_id } = body as {
    subject: string; topic: string; mode?: string; study_level?: string; drill_pattern_id?: string;
  };

  if (!subject || !topic) return softError('subject and topic are required', 'MISSING_FIELDS');

  const db   = adminClient();
  const sysP = buildSystemPrompt(mode as any, subject, study_level);

  // Get drill context if applicable
  let errorContext = '';
  if (mode === 'drill' && drill_pattern_id) {
    const { data: pattern } = await db
      .from('error_patterns').select('description').eq('id', drill_pattern_id).maybeSingle();
    if (pattern) errorContext = pattern.description;
  }
  const drillSysP = mode === 'drill'
    ? buildSystemPrompt('drill', subject, study_level, errorContext)
    : sysP;

  // ── Generate session structure ────────────────────────────────
  interface SessionStructure {
    objectives:      string[];
    concepts:        Array<{ title: string }>;
    intro_message:   string;
    first_teaching:  string;
  }

  const modeInstruction = mode === 'socratic'
    ? 'first_teaching: your first Socratic question to probe prior knowledge (1-2 sentences, ends with a "?")'
    : mode === 'drill'
    ? `first_teaching: a focused explanation of the error pattern and how to fix it (150-200 words). Then immediately show a worked example.`
    : 'first_teaching: a rich, engaging explanation of concept 1 using examples (150-250 words)';

  const startPrompt = `Generate a tutoring session structure for: "${topic}" (${subject}).
Study level: ${study_level}.

Return ONLY valid JSON — no markdown:
{
  "objectives":    ["objective 1", "objective 2", "objective 3"],
  "concepts":      [{"title": "concept name"}, ...],
  "intro_message": "Novo's warm welcome and objectives overview (80-120 words)",
  "first_teaching": "..."
}

objectives: 3-5 clear, measurable learning goals.
concepts: 3-5 key concepts in logical teaching order. Each builds on the previous.
intro_message: greet the student by first name placeholder {name}, outline what they will learn today. Be encouraging.
${modeInstruction}`;

  let structure: SessionStructure;
  try {
    structure = await callGeminiJSON<SessionStructure>(drillSysP, [], startPrompt);
  } catch (e) {
    return softError('AI service unavailable — please try again', 'AI_ERROR');
  }

  // Validate
  if (!Array.isArray(structure.objectives) || !Array.isArray(structure.concepts) ||
      !structure.intro_message || !structure.first_teaching) {
    return softError('AI returned unexpected format — please retry', 'AI_FORMAT_ERROR');
  }

  const concepts = structure.concepts.slice(0, 6).map(c => ({
    title:               c.title,
    status:              'teaching',       // first concept is active immediately
    checkpoint_attempts: 0,
  }));
  // Mark remaining as pending
  for (let i = 1; i < concepts.length; i++) (concepts[i] as any).status = 'pending';

  // ── Create session in DB ──────────────────────────────────────
  const { data: session, error: sessErr } = await db
    .from('tutoring_sessions')
    .insert({
      user_id:     userId,
      subject,
      topic,
      study_level,
      mode,
      objectives:  structure.objectives.map(o => ({ text: o, achieved: false })),
      concepts,
      phase:       'teaching',
      drill_pattern_id: drill_pattern_id ?? null,
    })
    .select('id')
    .single();

  if (sessErr || !session) return softError('Failed to create session', 'DB_ERROR');

  // ── Save intro + first teaching messages ─────────────────────
  const messages = [
    { session_id: session.id, role: 'novo', content: structure.intro_message,  message_type: 'objective',  concept_idx: null },
    { session_id: session.id, role: 'novo', content: structure.first_teaching, message_type: 'teaching',   concept_idx: 0 },
  ];
  await db.from('session_messages').insert(messages);

  return ok({
    session_id:     session.id,
    messages: [
      { id: 'intro', role: 'novo', content: structure.intro_message,  message_type: 'objective',  concept_idx: null },
      { id: 'teach', role: 'novo', content: structure.first_teaching, message_type: 'teaching',   concept_idx: 0 },
    ],
    session_state: {
      phase:             'teaching',
      status:            'active',
      concepts,
      objectives:        structure.objectives.map(o => ({ text: o, achieved: false })),
      current_concept:   concepts[0].title,
      current_concept_idx: 0,
      total_concepts:    concepts.length,
      score:             0,
      total_checkpoints: 0,
      teaching_exchanges: 0,
    },
  });
}

// ════════════════════════════════════════════════════════════════
// ACTION: message (student message during teaching phase)
// ════════════════════════════════════════════════════════════════
async function handleMessage(body: Record<string, unknown>, userId: string) {
  const { session_id, message: studentMessage } = body as { session_id: string; message: string };
  if (!session_id || !studentMessage?.trim()) return softError('session_id and message required', 'MISSING_FIELDS');

  const db = adminClient();

  // Load session
  const { data: session, error: sErr } = await db
    .from('tutoring_sessions')
    .select('*')
    .eq('id', session_id).eq('user_id', userId).single();
  if (sErr || !session) return softError('Session not found', 'SESSION_NOT_FOUND');
  if (session.status === 'complete') return softError('Session already complete', 'SESSION_COMPLETE');
  if (session.phase === 'checkpoint') return softError('Answer the checkpoint question first', 'CHECKPOINT_ACTIVE');

  // Load recent messages (last 10 for context)
  const { data: recentMsgs } = await db
    .from('session_messages')
    .select('role, content')
    .eq('session_id', session_id)
    .not('message_type', 'in', '("objective")')
    .order('created_at', { ascending: false })
    .limit(10);

  const history = buildHistory(((recentMsgs ?? []).reverse()) as DBMessage[]);
  const concepts = session.concepts as Array<{ title: string; status: string; checkpoint_attempts: number }>;
  const currentConcept = concepts[session.current_concept_idx];
  const sysP = buildSystemPrompt(session.mode, session.subject, session.study_level);

  // Build context for Novo
  const contextPrompt = `You are currently teaching: "${currentConcept?.title ?? session.topic}".
The student says: ${studentMessage}

${session.mode === 'socratic'
  ? 'Respond with a guiding question only. Do NOT explain or give the answer directly.'
  : 'Answer their question directly and clearly. Then briefly continue teaching if appropriate.'}

Keep your response focused and under 200 words.`;

  let novoReply: string;
  try {
    novoReply = await callGemini(sysP, history, contextPrompt, false, 0.7);
  } catch (_e) {
    return softError('AI service unavailable — please try again', 'AI_ERROR');
  }

  const newExchanges = (session.teaching_exchanges ?? 0) + 1;

  // Save both messages
  await db.from('session_messages').insert([
    { session_id, role: 'student', content: studentMessage, message_type: 'text',    concept_idx: session.current_concept_idx },
    { session_id, role: 'novo',    content: novoReply,       message_type: 'teaching', concept_idx: session.current_concept_idx },
  ]);

  // Update exchange counter
  await db.from('tutoring_sessions').update({ teaching_exchanges: newExchanges }).eq('id', session_id);

  return ok({
    message:  { role: 'novo', content: novoReply, message_type: 'teaching' },
    session_state: {
      phase:              'teaching',
      teaching_exchanges: newExchanges,
      // Prompt the student to try the checkpoint after 3 exchanges
      show_checkpoint_prompt: newExchanges >= 3,
    },
  });
}

// ════════════════════════════════════════════════════════════════
// ACTION: request_checkpoint
// ════════════════════════════════════════════════════════════════
async function handleRequestCheckpoint(body: Record<string, unknown>, userId: string) {
  const { session_id } = body as { session_id: string };
  if (!session_id) return softError('session_id required', 'MISSING_FIELDS');

  const db = adminClient();

  const { data: session, error: sErr } = await db
    .from('tutoring_sessions')
    .select('*')
    .eq('id', session_id).eq('user_id', userId).single();
  if (sErr || !session) return softError('Session not found', 'SESSION_NOT_FOUND');
  if (session.phase === 'checkpoint') return softError('Checkpoint already active', 'CHECKPOINT_ACTIVE');
  if (session.status === 'complete') return softError('Session already complete', 'SESSION_COMPLETE');

  const concepts = session.concepts as Array<{ title: string; status: string; checkpoint_attempts: number }>;
  const currentConcept = concepts[session.current_concept_idx];

  // Look up or initialise subtopic_mastery to get current difficulty
  let mastery = { difficulty_level: 3, mastery_score: 0.5, consecutive_correct: 0, consecutive_wrong: 0 };
  const { data: existing } = await db
    .from('subtopic_mastery')
    .select('difficulty_level, mastery_score, consecutive_correct, consecutive_wrong')
    .eq('user_id', userId)
    .eq('subject', session.subject)
    .eq('subtopic', currentConcept.title)
    .maybeSingle();

  if (existing) mastery = existing;
  const difficulty = computeDifficulty(mastery);
  const diffLabel  = DIFFICULTY_LABELS[difficulty];

  // Generate checkpoint question
  const sysP = buildSystemPrompt(session.mode, session.subject, session.study_level);

  interface CheckpointQ {
    question:    string;
    options:     string[];
    correct_idx: number;
    explanation: string;
  }

  const checkpointPrompt = `Generate a checkpoint multiple-choice question to test understanding of: "${currentConcept.title}" in ${session.subject}.

Cognitive level: ${diffLabel} (Bloom's taxonomy level ${difficulty}/5)
Study level: ${session.study_level}

Return ONLY valid JSON:
{
  "question":    "The question text",
  "options":     ["Option A", "Option B", "Option C", "Option D"],
  "correct_idx": 0,
  "explanation": "Brief explanation of why this is correct (50-80 words)"
}

Rules:
- exactly 4 options
- correct_idx is 0-indexed
- all options must be plausible (no obviously wrong distractors)
- question must be answerable from what was just taught`;

  let checkpoint: CheckpointQ;
  try {
    checkpoint = await callGeminiJSON<CheckpointQ>(sysP, [], checkpointPrompt);
  } catch (_e) {
    return softError('AI service unavailable — please try again', 'AI_ERROR');
  }

  // Validate
  if (!checkpoint.question || !Array.isArray(checkpoint.options) ||
      checkpoint.options.length !== 4 ||
      typeof checkpoint.correct_idx !== 'number') {
    return softError('AI returned malformed checkpoint — please retry', 'AI_FORMAT_ERROR');
  }

  // Store full checkpoint (with correct_idx) in DB — correct_idx is NEVER sent to client
  await db.from('tutoring_sessions').update({
    phase:              'checkpoint',
    current_checkpoint: checkpoint,
  }).eq('id', session_id);

  // Save checkpoint question as a message
  await db.from('session_messages').insert({
    session_id,
    role:         'novo',
    content:      checkpoint.question,
    message_type: 'checkpoint_question',
    concept_idx:  session.current_concept_idx,
  });

  return ok({
    checkpoint: {
      question: checkpoint.question,
      options:  checkpoint.options,
      // correct_idx intentionally omitted
    },
    session_state: {
      phase:      'checkpoint',
      difficulty: difficulty,
      diff_label: diffLabel,
    },
  });
}

// ════════════════════════════════════════════════════════════════
// ACTION: submit_answer
// ════════════════════════════════════════════════════════════════
async function handleSubmitAnswer(body: Record<string, unknown>, userId: string) {
  const { session_id, answer_idx } = body as { session_id: string; answer_idx: number };
  if (!session_id || typeof answer_idx !== 'number') {
    return softError('session_id and answer_idx required', 'MISSING_FIELDS');
  }

  const db = adminClient();

  const { data: session, error: sErr } = await db
    .from('tutoring_sessions')
    .select('*')
    .eq('id', session_id).eq('user_id', userId).single();
  if (sErr || !session) return softError('Session not found', 'SESSION_NOT_FOUND');
  if (session.phase !== 'checkpoint') return softError('No checkpoint active', 'NO_CHECKPOINT');

  const checkpoint = session.current_checkpoint as {
    question: string; options: string[]; correct_idx: number; explanation: string;
  };
  if (!checkpoint) return softError('Checkpoint data missing', 'NO_CHECKPOINT');

  const isCorrect    = answer_idx === checkpoint.correct_idx;
  const correctLabel = checkpoint.options[checkpoint.correct_idx];
  const chosenLabel  = checkpoint.options[answer_idx];

  const concepts = session.concepts as Array<{ title: string; status: string; checkpoint_attempts: number }>;
  const conceptIdx  = session.current_concept_idx;
  const currentConcept = concepts[conceptIdx];

  // ── Update subtopic_mastery (Bayesian update) ─────────────────
  const { data: existingMastery } = await db
    .from('subtopic_mastery')
    .select('*')
    .eq('user_id', userId)
    .eq('subject', session.subject)
    .eq('subtopic', currentConcept.title)
    .maybeSingle();

  const prev = existingMastery ?? {
    user_id: userId, subject: session.subject, subtopic: currentConcept.title,
    difficulty_level: 3, attempts: 0, correct: 0,
    consecutive_correct: 0, consecutive_wrong: 0, mastery_score: 0.5,
  };

  const newAttempts   = prev.attempts + 1;
  const newCorrect    = prev.correct + (isCorrect ? 1 : 0);
  const newConsecCorr = isCorrect ? prev.consecutive_correct + 1 : 0;
  const newConsecWrong = isCorrect ? 0 : prev.consecutive_wrong + 1;
  // Wilson lower bound for mastery_score
  const z  = 1.645; // 95% confidence
  const p  = newCorrect / newAttempts;
  const n  = newAttempts;
  const wi = (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n);
  const newMastery = Math.max(0, Math.min(1, wi));

  const nextDifficulty = computeDifficulty({
    difficulty_level:    prev.difficulty_level,
    mastery_score:       newMastery,
    consecutive_correct: newConsecCorr,
    consecutive_wrong:   newConsecWrong,
  });

  await db.from('subtopic_mastery').upsert({
    user_id:             userId,
    subject:             session.subject,
    subtopic:            currentConcept.title,
    difficulty_level:    nextDifficulty,
    attempts:            newAttempts,
    correct:             newCorrect,
    consecutive_correct: newConsecCorr,
    consecutive_wrong:   newConsecWrong,
    mastery_score:       newMastery,
    last_attempted_at:   new Date().toISOString(),
  }, { onConflict: 'user_id,subject,subtopic' });

  // ── Generate feedback message ─────────────────────────────────
  const sysP = buildSystemPrompt(session.mode, session.subject, session.study_level);
  const feedbackPrompt = isCorrect
    ? `The student answered a checkpoint question CORRECTLY.
Question: ${checkpoint.question}
Their answer: "${chosenLabel}" ✓
Correct answer: "${correctLabel}"
Explanation: ${checkpoint.explanation}

Write 2-3 sentences of encouraging feedback. Confirm WHY their answer is correct. End with a brief transition to what's coming next.`
    : `The student answered a checkpoint question INCORRECTLY.
Question: ${checkpoint.question}
Their answer: "${chosenLabel}" ✗
Correct answer: "${correctLabel}"
Explanation: ${checkpoint.explanation}
This was their attempt #${currentConcept.checkpoint_attempts + 1}.

Write 2-3 sentences of kind, corrective feedback. Be warm — mistakes are normal. Explain clearly why "${correctLabel}" is correct. ${currentConcept.checkpoint_attempts >= 1 ? "Tell them we'll move on anyway so they don't feel stuck." : "Tell them you'll re-explain this before another try."}`;

  let feedbackText: string;
  try {
    feedbackText = await callGemini(sysP, [], feedbackPrompt, false, 0.6);
  } catch (_e) {
    feedbackText = isCorrect
      ? `Correct! ${checkpoint.explanation}`
      : `Not quite — ${checkpoint.explanation}`;
  }

  // ── Update concepts array ─────────────────────────────────────
  const updatedConcepts = [...concepts];
  const newAttemptCount = (currentConcept.checkpoint_attempts ?? 0) + 1;
  const passed = isCorrect || newAttemptCount >= 2; // max 2 attempts per concept

  if (passed) {
    updatedConcepts[conceptIdx] = { ...currentConcept, status: 'mastered', checkpoint_attempts: newAttemptCount };
  } else {
    updatedConcepts[conceptIdx] = { ...currentConcept, status: 'retry', checkpoint_attempts: newAttemptCount };
  }

  const newScore      = session.score + (isCorrect ? 1 : 0);
  const newTotalCP    = session.total_checkpoints + 1;
  const nextConceptIdx = passed ? conceptIdx + 1 : conceptIdx;
  const hasNextConcept = nextConceptIdx < concepts.length;

  // ── Save checkpoint answer + feedback messages ────────────────
  await db.from('session_messages').insert([
    { session_id, role: 'student', content: chosenLabel, message_type: 'checkpoint_answer',
      concept_idx: conceptIdx, is_correct: isCorrect },
    { session_id, role: 'novo',    content: feedbackText, message_type: 'feedback',
      concept_idx: conceptIdx },
  ]);

  // ── Determine next phase ──────────────────────────────────────
  let nextPhase: string;
  let nextTeachingMessage: string | null = null;
  let sessionComplete = false;

  if (passed && hasNextConcept) {
    // Teach next concept
    const nextConcept = updatedConcepts[nextConceptIdx];
    nextConcept.status = 'teaching';

    const teachPrompt = `Continue the tutoring session.
Transition from "${currentConcept.title}" to the next concept: "${nextConcept.title}".
Brief transition sentence, then teach "${nextConcept.title}" with an example.
150-250 words. Markdown ok.`;

    try {
      nextTeachingMessage = await callGemini(sysP, [], teachPrompt, false, 0.7);
    } catch (_e) {
      nextTeachingMessage = `Great work! Now let's move on to: **${nextConcept.title}**.`;
    }

    await db.from('session_messages').insert({
      session_id, role: 'novo', content: nextTeachingMessage,
      message_type: 'teaching', concept_idx: nextConceptIdx,
    });

    nextPhase = 'teaching';

  } else if (passed && !hasNextConcept) {
    // Session complete
    const accuracy = Math.round((newScore / newTotalCP) * 100);
    const xp = Math.round(50 + accuracy * 0.5 + concepts.length * 10);

    const wrapPrompt = `The student has completed the entire tutoring session on "${session.topic}".
Score: ${newScore}/${newTotalCP} checkpoint questions correct (${accuracy}%).
Concepts covered: ${concepts.map(c => c.title).join(', ')}.

Write a warm, celebratory wrap-up message (100-150 words):
1. Congratulate them genuinely
2. Recap 2-3 key things they learned
3. Encourage them to check their Concept Map
4. Give them a motivating closing line`;

    let wrapUp = `🎉 Excellent work completing your session on **${session.topic}**! You've mastered ${concepts.length} concepts today.`;
    try { wrapUp = await callGemini(sysP, [], wrapPrompt, false, 0.7); } catch (_e) { /* keep default */ }

    await db.from('session_messages').insert({
      session_id, role: 'novo', content: wrapUp, message_type: 'complete', concept_idx: null,
    });

    await db.from('tutoring_sessions').update({
      status:              'complete',
      phase:               'complete',
      score:               newScore,
      total_checkpoints:   newTotalCP,
      xp_earned:           xp,
      concepts:            updatedConcepts,
      current_checkpoint:  null,
      teaching_exchanges:  0,
      completed_at:        new Date().toISOString(),
    }).eq('id', session_id);

    // ── Fire-and-forget: persist session into Novo memory ────────────────────
    // Identifies concepts with low mastery scores as struggles, high as wins.
    // deno-lint-ignore no-explicit-any
    const struggles = (updatedConcepts as any[])
      .filter((c: { mastery_score?: number; title: string }) => (c.mastery_score ?? 1) < 0.6)
      .map((c: { title: string }) => c.title);
    // deno-lint-ignore no-explicit-any
    const wins = (updatedConcepts as any[])
      .filter((c: { mastery_score?: number; title: string }) => (c.mastery_score ?? 0) >= 0.8)
      .map((c: { title: string }) => c.title);

    db.from('novo_session_summaries').insert({
      user_id: session.user_id,
      source:  'tutoring',
      topic:   session.topic,
      summary: `Tutoring session on "${session.topic}": ${accuracy}% accuracy over ${newTotalCP} checkpoints. Covered ${concepts.length} concepts.`,
      struggles: struggles.length > 0 ? struggles : null,
      wins:      wins.length > 0 ? wins : null,
    }).then(() => {}).catch(() => {});

    // Save weakness memory if overall accuracy was low
    if (accuracy < 60) {
      db.from('novo_memories').insert({
        user_id:     session.user_id,
        memory_type: 'struggle',
        content:     `Struggled during tutoring on "${session.topic}" — ${accuracy}% accuracy`,
        topic:       session.topic,
        importance:  accuracy < 40 ? 8 : 6,
        source:      'tutoring',
      }).then(() => {}).catch(() => {});
    } else if (accuracy >= 85) {
      db.from('novo_memories').insert({
        user_id:     session.user_id,
        memory_type: 'strength',
        content:     `Mastered "${session.topic}" in tutoring with ${accuracy}% accuracy`,
        topic:       session.topic,
        importance:  7,
        source:      'tutoring',
      }).then(() => {}).catch(() => {});
    }

    return ok({
      is_correct:     isCorrect,
      correct_answer: correctLabel,
      feedback:       feedbackText,
      session_complete: true,
      wrap_up_message: wrapUp,
      session_state: {
        phase:             'complete',
        status:            'complete',
        score:             newScore,
        total_checkpoints: newTotalCP,
        xp_earned:         xp,
        accuracy_pct:      accuracy,
        concepts:          updatedConcepts,
      },
    });

  } else {
    // Failed checkpoint, attempt < max — re-teach
    const retryPrompt = `The student got the checkpoint wrong on "${currentConcept.title}".
Their wrong answer: "${chosenLabel}"
Correct answer: "${correctLabel}"

Re-teach this concept from a different angle. Use a different example or analogy. Keep it under 200 words. Do NOT just repeat yourself.`;

    let retryTeaching = `Let me approach **${currentConcept.title}** from a different angle...`;
    try { retryTeaching = await callGemini(sysP, [], retryPrompt, false, 0.7); } catch (_e) { /* keep default */ }

    await db.from('session_messages').insert({
      session_id, role: 'novo', content: retryTeaching,
      message_type: 'teaching', concept_idx: conceptIdx,
    });

    nextTeachingMessage = retryTeaching;
    nextPhase = 'teaching';
  }

  // ── Update session state ──────────────────────────────────────
  await db.from('tutoring_sessions').update({
    score:              newScore,
    total_checkpoints:  newTotalCP,
    concepts:           updatedConcepts,
    current_concept_idx: nextConceptIdx,
    current_checkpoint: null,
    phase:              nextPhase as any,
    teaching_exchanges: 0,
  }).eq('id', session_id);

  return ok({
    is_correct:          isCorrect,
    correct_answer:      correctLabel,
    feedback:            feedbackText,
    next_teaching:       nextTeachingMessage,
    session_complete:    sessionComplete,
    session_state: {
      phase:              nextPhase,
      status:             'active',
      score:              newScore,
      total_checkpoints:  newTotalCP,
      current_concept_idx: nextConceptIdx,
      current_concept:    updatedConcepts[nextConceptIdx]?.title ?? null,
      concepts:           updatedConcepts,
      teaching_exchanges: 0,
      show_checkpoint_prompt: false,
    },
  });
}

// ════════════════════════════════════════════════════════════════
// Main handler
// ════════════════════════════════════════════════════════════════
Deno.serve(withSentry('tutoring-engine', async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // Auth
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return softError('Unauthorized', 'UNAUTHORIZED');

  // Decode user_id from JWT (Supabase: sub claim)
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !user) return softError('Unauthorized', 'UNAUTHORIZED');

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch (_) { return softError('Invalid JSON body', 'BAD_REQUEST'); }

  const action = body.action as string;

  // Single early rate-limit check covering all actions — this is a heavy AI-generation
  // endpoint (Gemini calls in start/message/request_checkpoint/submit_answer), and auth
  // resolves once here for all actions, so one check upfront is sufficient and simplest.
  const rl = await checkRateLimit(adminClient(), user.id, `tutoring_engine_${action}`, 25, 60);
  if (!rl.allowed) return softError('Too many requests. Try again later.', 'RATE_LIMITED');

  try {
    switch (action) {
      case 'start':              return await handleStart(body, user.id);
      case 'message':            return await handleMessage(body, user.id);
      case 'request_checkpoint': return await handleRequestCheckpoint(body, user.id);
      case 'submit_answer':      return await handleSubmitAnswer(body, user.id);
      default:
        return softError(`Unknown action: ${action}`, 'UNKNOWN_ACTION');
    }
  } catch (err) {
    console.error('[tutoring-engine] Unhandled error:', err);
    return softError('Internal server error', 'INTERNAL_ERROR');
  }
}));
