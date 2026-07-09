// ─────────────────────────────────────────────────────────────────────────────
// Adaptive Difficulty — Feature 4
//
// Maintains a subtopic_mastery row per (user, subject, subtopic).
// Uses a Wilson lower-bound Bayesian estimate for mastery_score.
// Difficulty auto-scales (1–5) based on consecutive runs and mastery.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase';

export interface SubtopicMastery {
  id?:                 string;
  user_id:             string;
  subject:             string;
  subtopic:            string;
  difficulty_level:    1 | 2 | 3 | 4 | 5;
  attempts:            number;
  correct:             number;
  consecutive_correct: number;
  consecutive_wrong:   number;
  mastery_score:       number; // 0-1
  last_attempted_at:   string | null;
}

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Remember',
  2: 'Understand',
  3: 'Apply',
  4: 'Analyse',
  5: 'Evaluate',
};

export const DIFFICULTY_COLOURS: Record<number, string> = {
  1: '#10B981', // green
  2: '#6EE7B7',
  3: '#F59E0B', // amber
  4: '#F97316', // orange
  5: '#EF4444', // red
};

// ── Wilson lower bound ────────────────────────────────────────────────────────
function wilsonLowerBound(correct: number, total: number): number {
  if (total === 0) return 0.5;
  const z = 1.645; // 95% confidence
  const p = correct / total;
  return (
    (p + (z * z) / (2 * total) -
      z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) /
    (1 + (z * z) / total)
  );
}

// ── Next difficulty level ─────────────────────────────────────────────────────
export function nextDifficulty(m: Pick<SubtopicMastery,
  'difficulty_level' | 'mastery_score' | 'consecutive_correct' | 'consecutive_wrong'>
): 1 | 2 | 3 | 4 | 5 {
  const { difficulty_level: d, mastery_score, consecutive_correct, consecutive_wrong } = m;
  if (consecutive_correct >= 3 && mastery_score >= 0.8) return Math.min(5, d + 1) as 1 | 2 | 3 | 4 | 5;
  if (consecutive_wrong  >= 2 || mastery_score  < 0.35) return Math.max(1, d - 1) as 1 | 2 | 3 | 4 | 5;
  return d;
}

// ── Mastery colour for UI ─────────────────────────────────────────────────────
export function masteryColour(pct: number): string {
  if (pct >= 80) return '#10B981'; // green
  if (pct >= 60) return '#F59E0B'; // amber
  if (pct >= 40) return '#F97316'; // orange
  return '#EF4444';                // red
}

export function masteryLabel(pct: number): string {
  if (pct >= 80) return 'Mastered';
  if (pct >= 60) return 'Developing';
  if (pct >= 40) return 'Learning';
  return 'Needs Work';
}

// ── Load current mastery (returns a safe default if none exists) ──────────────
export async function loadMastery(
  userId: string,
  subject: string,
  subtopic: string,
): Promise<SubtopicMastery> {
  const { data } = await supabase
    .from('subtopic_mastery')
    .select('*')
    .eq('user_id', userId)
    .eq('subject',  subject)
    .eq('subtopic', subtopic)
    .maybeSingle();

  return data ?? {
    user_id:             userId,
    subject,
    subtopic,
    difficulty_level:    3,
    attempts:            0,
    correct:             0,
    consecutive_correct: 0,
    consecutive_wrong:   0,
    mastery_score:       0.5,
    last_attempted_at:   null,
  };
}

// ── Record a quiz/checkpoint answer and update mastery ────────────────────────
export async function recordAnswer(
  userId: string,
  subject: string,
  subtopic: string,
  isCorrect: boolean,
): Promise<SubtopicMastery> {
  const prev = await loadMastery(userId, subject, subtopic);

  const newAttempts    = prev.attempts + 1;
  const newCorrect     = prev.correct + (isCorrect ? 1 : 0);
  const newConsecCorr  = isCorrect ? prev.consecutive_correct + 1 : 0;
  const newConsecWrong = isCorrect ? 0 : prev.consecutive_wrong + 1;
  const newMastery     = Math.max(0, Math.min(1, wilsonLowerBound(newCorrect, newAttempts)));
  const newDifficulty  = nextDifficulty({
    difficulty_level:    prev.difficulty_level,
    mastery_score:       newMastery,
    consecutive_correct: newConsecCorr,
    consecutive_wrong:   newConsecWrong,
  });

  const updated: SubtopicMastery = {
    ...prev,
    difficulty_level:    newDifficulty,
    attempts:            newAttempts,
    correct:             newCorrect,
    consecutive_correct: newConsecCorr,
    consecutive_wrong:   newConsecWrong,
    mastery_score:       newMastery,
    last_attempted_at:   new Date().toISOString(),
  };

  await supabase.from('subtopic_mastery').upsert(
    { ...updated, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,subject,subtopic' },
  );

  return updated;
}

// ── Aggregate mastery for a subject (for the Concept Map) ─────────────────────
export async function loadSubjectMastery(
  userId: string,
  subject: string,
): Promise<SubtopicMastery[]> {
  const { data } = await supabase
    .from('subtopic_mastery')
    .select('*')
    .eq('user_id', userId)
    .eq('subject',  subject)
    .order('last_attempted_at', { ascending: false });
  return (data ?? []) as SubtopicMastery[];
}
