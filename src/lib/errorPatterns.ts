// ─────────────────────────────────────────────────────────────────────────────
// Error Pattern Engine — Feature 5
//
// Analyses wrong answers from quizzes and tutoring sessions to detect
// recurring mistake patterns, then persists them in error_patterns.
//
// Detection is triggered explicitly (user taps "Scan for Patterns") so we
// never surprise users with a slow background call.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';

export interface ErrorPattern {
  id:               string;
  user_id:          string;
  subject:          string;
  pattern_type:     string;
  description:      string;
  occurrence_count: number;
  is_resolved:      boolean;
  example_errors:   Array<{ question: string; student_answer: string; correct_answer: string }>;
  last_drill_at:    string | null;
  last_detected_at: string;
  created_at:       string;
}

// ── Fetch wrong answers from the last 60 days for a subject ──────────────────
async function fetchWrongAnswers(userId: string, subject: string | null) {
  // From quiz_sessions
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('quiz_sessions')
    .select('id, subject, questions, user_answers')
    .eq('user_id', userId)
    .gte('created_at', cutoff)
    .not('user_answers', 'eq', '[]');
  if (subject) query = query.eq('subject', subject);

  const { data: quizSessions } = await query.limit(20);

  // From session_messages (checkpoint answers marked is_correct = false)
  let msgQuery = supabase
    .from('session_messages')
    .select('content, concept_idx, session_id, tutoring_sessions!inner(subject, topic)')
    .eq('message_type', 'checkpoint_answer')
    .eq('is_correct', false);

  const { data: wrongCheckpoints } = await msgQuery.limit(30);

  // Build a flat list of wrong answers
  const wrongs: Array<{ question: string; student_answer: string; correct_answer: string; subject: string }> = [];

  for (const session of quizSessions ?? []) {
    const questions = (session.questions ?? []) as Array<{
      question: string; options: string[]; correct_answer: number;
    }>;
    const userAnswers = (session.user_answers ?? []) as number[];
    questions.forEach((q, i) => {
      const ua = userAnswers[i];
      if (typeof ua === 'number' && ua !== q.correct_answer) {
        wrongs.push({
          question:       q.question,
          student_answer: q.options?.[ua] ?? String(ua),
          correct_answer: q.options?.[q.correct_answer] ?? String(q.correct_answer),
          subject:        session.subject,
        });
      }
    });
  }

  type CheckpointRow = { content: string; tutoring_sessions: { subject: string; topic: string } | null };
  for (const msg of (wrongCheckpoints ?? []) as unknown as CheckpointRow[]) {
    const ts = msg.tutoring_sessions;
    wrongs.push({
      question:       `Checkpoint on ${ts?.topic ?? ''}`,
      student_answer: msg.content,
      correct_answer: '(see session feedback)',
      subject:        ts?.subject ?? subject ?? '',
    });
  }

  return wrongs;
}

// ── Detect patterns via Gemini ────────────────────────────────────────────────
interface DetectedPattern {
  pattern_type:  string;
  description:   string;
  example_errors: Array<{ question: string; student_answer: string; correct_answer: string }>;
}

async function detectPatterns(
  wrongs: Array<{ question: string; student_answer: string; correct_answer: string; subject: string }>,
  subject: string | null,
): Promise<DetectedPattern[]> {
  if (wrongs.length < 2) return []; // not enough data

  const sample = wrongs.slice(0, 20); // cap to avoid token overflow
  const formattedErrors = sample.map((w, i) =>
    `${i + 1}. Q: "${w.question}" | Student: "${w.student_answer}" | Correct: "${w.correct_answer}"`
  ).join('\n');

  const prompt = `Analyse these wrong answers from a student studying ${subject ?? 'various subjects'}.
Identify recurring mistake patterns — errors that appear more than once or suggest a systematic misunderstanding.

Wrong answers:
${formattedErrors}

Return ONLY valid JSON — an array of pattern objects (max 5):
[
  {
    "pattern_type": "short_snake_case_identifier",
    "description": "Human-readable description (1 sentence, starting with verb, e.g. 'Confuses force with momentum when...')",
    "example_errors": [
      {"question": "...", "student_answer": "...", "correct_answer": "..."},
      {"question": "...", "student_answer": "...", "correct_answer": "..."}
    ]
  }
]

Rules:
- pattern_type must be a short snake_case identifier (e.g. sign_error, unit_conversion, formula_recall)
- Only include patterns with at least 2 supporting examples
- If no patterns detected, return []
- description must be specific, not generic like "makes mistakes"`;

  return geminiJSON<DetectedPattern[]>(prompt);
}

// ── Main: scan for patterns and persist ──────────────────────────────────────
export async function scanAndPersistPatterns(
  userId: string,
  subject: string | null = null,
): Promise<{ patterns: ErrorPattern[]; newCount: number; updatedCount: number }> {
  const wrongs = await fetchWrongAnswers(userId, subject);
  if (wrongs.length < 2) {
    return { patterns: [], newCount: 0, updatedCount: 0 };
  }

  let detected: DetectedPattern[];
  try {
    detected = await detectPatterns(wrongs, subject);
  } catch (_e) {
    return { patterns: [], newCount: 0, updatedCount: 0 };
  }

  let newCount = 0;
  let updatedCount = 0;

  for (const p of detected) {
    const subjectForPattern = subject ?? (wrongs[0]?.subject ?? 'General');

    // Upsert: increment occurrence_count if exists, insert if new
    const { data: existing } = await supabase
      .from('error_patterns')
      .select('id, occurrence_count, example_errors')
      .eq('user_id',      userId)
      .eq('subject',      subjectForPattern)
      .eq('pattern_type', p.pattern_type)
      .maybeSingle();

    if (existing) {
      const mergedExamples = [
        ...(existing.example_errors ?? []),
        ...p.example_errors,
      ].slice(0, 5); // keep max 5 examples

      await supabase.from('error_patterns').update({
        description:      p.description,
        occurrence_count: existing.occurrence_count + 1,
        example_errors:   mergedExamples,
        last_detected_at: new Date().toISOString(),
        is_resolved:      false, // re-open if it was resolved
      }).eq('id', existing.id);
      updatedCount++;
    } else {
      await supabase.from('error_patterns').insert({
        user_id:          userId,
        subject:          subjectForPattern,
        pattern_type:     p.pattern_type,
        description:      p.description,
        occurrence_count: 1,
        example_errors:   p.example_errors.slice(0, 3),
        last_detected_at: new Date().toISOString(),
      });
      newCount++;
    }
  }

  // Fetch updated list
  let finalQuery = supabase
    .from('error_patterns')
    .select('*')
    .eq('user_id',     userId)
    .eq('is_resolved', false)
    .order('last_detected_at', { ascending: false });
  if (subject) finalQuery = finalQuery.eq('subject', subject);

  const { data: patterns } = await finalQuery;

  return {
    patterns:    (patterns ?? []) as ErrorPattern[],
    newCount,
    updatedCount,
  };
}

// ── Load patterns for display ─────────────────────────────────────────────────
export async function loadErrorPatterns(
  userId: string,
  subject: string | null = null,
  includeResolved = false,
): Promise<ErrorPattern[]> {
  let query = supabase
    .from('error_patterns')
    .select('*')
    .eq('user_id', userId)
    .order('last_detected_at', { ascending: false });

  if (subject) query = query.eq('subject', subject);
  if (!includeResolved) query = query.eq('is_resolved', false);

  const { data } = await query;
  return (data ?? []) as ErrorPattern[];
}

// ── Mark a pattern as resolved ────────────────────────────────────────────────
export async function resolvePattern(patternId: string): Promise<void> {
  await supabase
    .from('error_patterns')
    .update({ is_resolved: true })
    .eq('id', patternId);
}

// ── Record that a drill was started for a pattern ─────────────────────────────
export async function recordDrillStart(patternId: string): Promise<void> {
  await supabase
    .from('error_patterns')
    .update({ last_drill_at: new Date().toISOString() })
    .eq('id', patternId);
}
