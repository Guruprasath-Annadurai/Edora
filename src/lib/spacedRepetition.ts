// ─────────────────────────────────────────────────────────────────────────────
// Spaced Repetition Engine — SM-2 Algorithm (Tier 2 Feature 9)
//
// SM-2 reference: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
// Quality: 0-5 (0-2 = failure, 3-5 = success)
//   5 = perfect response
//   4 = correct with some hesitation
//   3 = correct with serious difficulty
//   2 = incorrect; correct answer seemed easy to recall
//   1 = incorrect; correct answer remembered
//   0 = complete blackout
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase';

export interface SRCard {
  id:               string;
  user_id:          string;
  subject:          string;
  topic:            string;
  source_type:      'tutoring' | 'quiz' | 'manual' | 'curriculum';
  source_id:        string | null;
  front:            string;
  back:             string;
  easiness_factor:  number;
  interval_days:    number;
  repetitions:      number;
  last_quality:     number | null;
  next_review_date: string;
  last_reviewed_at: string | null;
  total_reviews:    number;
  correct_reviews:  number;
  created_at:       string;
}

export interface ReviewResult {
  card:         SRCard;
  next_date:    string;
  interval:     number;
  was_correct:  boolean;
}

// ── Core SM-2 calculation ─────────────────────────────────────────────────────
export function sm2(
  quality:        number,      // 0-5
  prevEF:         number,      // easiness factor (starts 2.5)
  prevInterval:   number,      // days
  prevRepetitions:number,      // count
): { ef: number; interval: number; repetitions: number } {
  // Clamp quality
  const q = Math.max(0, Math.min(5, Math.round(quality)));

  // Update easiness factor
  let ef = prevEF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ef = Math.max(1.3, ef);  // EF never goes below 1.3

  let interval: number;
  let repetitions: number;

  if (q < 3) {
    // Failed: restart sequence
    interval    = 1;
    repetitions = 0;
  } else {
    // Success
    repetitions = prevRepetitions + 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(prevInterval * ef);
    }
  }

  return { ef, interval, repetitions };
}

// ── Map user tap to SM-2 quality ──────────────────────────────────────────────
// difficulty: 'easy' | 'good' | 'hard' | 'again'
export function tapToQuality(difficulty: 'easy' | 'good' | 'hard' | 'again'): number {
  switch (difficulty) {
    case 'easy':  return 5;
    case 'good':  return 4;
    case 'hard':  return 3;
    case 'again': return 1;
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isDue(card: SRCard): boolean {
  return card.next_review_date <= todayISO();
}

export function daysUntilDue(card: SRCard): number {
  const now  = new Date(todayISO());
  const due  = new Date(card.next_review_date);
  const diff = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  return Math.max(0, diff);
}

// ── Fetch today's review queue ────────────────────────────────────────────────
export async function fetchDueCards(
  userId:  string,
  subject: string | null = null,
  limit    = 20,
): Promise<SRCard[]> {
  const today = todayISO();
  let q = supabase
    .from('sr_cards')
    .select('*')
    .eq('user_id', userId)
    .lte('next_review_date', today)
    .order('next_review_date', { ascending: true })
    .limit(limit);

  if (subject) q = q.eq('subject', subject);
  const { data } = await q;
  return (data ?? []) as SRCard[];
}

// ── Fetch upcoming cards (next 7 days) ────────────────────────────────────────
export async function fetchUpcomingCards(userId: string, days = 7): Promise<SRCard[]> {
  const today = todayISO();
  const future = addDays(new Date(), days);
  const { data } = await supabase
    .from('sr_cards')
    .select('*')
    .eq('user_id', userId)
    .gt('next_review_date', today)
    .lte('next_review_date', future)
    .order('next_review_date', { ascending: true });
  return (data ?? []) as SRCard[];
}

// ── Fetch all cards (for stats) ───────────────────────────────────────────────
export async function fetchAllCards(userId: string): Promise<SRCard[]> {
  const { data } = await supabase
    .from('sr_cards')
    .select('*')
    .eq('user_id', userId)
    .order('next_review_date', { ascending: true });
  return (data ?? []) as SRCard[];
}

// ── Submit a review ───────────────────────────────────────────────────────────
export async function submitReview(
  card:       SRCard,
  difficulty: 'easy' | 'good' | 'hard' | 'again',
): Promise<ReviewResult> {
  const quality    = tapToQuality(difficulty);
  const wasCorrect = quality >= 3;
  const { ef, interval, repetitions } = sm2(quality, card.easiness_factor, card.interval_days, card.repetitions);
  const nextDate = addDays(new Date(), interval);

  const updated: Partial<SRCard> = {
    easiness_factor:  ef,
    interval_days:    interval,
    repetitions,
    last_quality:     quality,
    next_review_date: nextDate,
    last_reviewed_at: new Date().toISOString(),
    total_reviews:    card.total_reviews + 1,
    correct_reviews:  card.correct_reviews + (wasCorrect ? 1 : 0),
  };

  await supabase.from('sr_cards').update(updated).eq('id', card.id);

  return {
    card:        { ...card, ...updated } as SRCard,
    next_date:   nextDate,
    interval,
    was_correct: wasCorrect,
  };
}

// ── Create cards manually ─────────────────────────────────────────────────────
export async function createCard(
  userId:  string,
  subject: string,
  topic:   string,
  front:   string,
  back:    string,
): Promise<SRCard> {
  const { data, error } = await supabase
    .from('sr_cards')
    .insert({
      user_id:         userId,
      subject,
      topic,
      source_type:     'manual',
      front,
      back,
      next_review_date: todayISO(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as SRCard;
}

// ── Create cards from a tutoring session (called after session completes) ─────
export async function createCardsFromSession(
  userId:    string,
  subject:   string,
  topic:     string,
  sessionId: string,
  pairs:     Array<{ front: string; back: string }>,
): Promise<number> {
  if (!pairs.length) return 0;

  const rows = pairs.map(p => ({
    user_id:         userId,
    subject,
    topic,
    source_type:     'tutoring' as const,
    source_id:       sessionId,
    front:           p.front,
    back:            p.back,
    next_review_date: todayISO(),
  }));

  const { error } = await supabase.from('sr_cards').insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

// ── Stats for a user ──────────────────────────────────────────────────────────
export interface SRStats {
  total:      number;
  due_today:  number;
  new_cards:  number;     // never reviewed
  mastered:   number;     // interval >= 21 days
  accuracy:   number;     // 0-1
  streak_days:number;     // consecutive days with at least 1 review
  by_subject: Record<string, { total: number; due: number }>;
}

export async function fetchStats(userId: string): Promise<SRStats> {
  const cards = await fetchAllCards(userId);
  const today = todayISO();

  const due      = cards.filter(c => c.next_review_date <= today);
  const never    = cards.filter(c => c.repetitions === 0);
  const mastered = cards.filter(c => c.interval_days >= 21);

  const totalReviews  = cards.reduce((s, c) => s + c.total_reviews, 0);
  const correctReviews = cards.reduce((s, c) => s + c.correct_reviews, 0);
  const accuracy = totalReviews > 0 ? correctReviews / totalReviews : 0;

  const bySubject: Record<string, { total: number; due: number }> = {};
  for (const c of cards) {
    if (!bySubject[c.subject]) bySubject[c.subject] = { total: 0, due: 0 };
    bySubject[c.subject].total++;
    if (c.next_review_date <= today) bySubject[c.subject].due++;
  }

  return {
    total:       cards.length,
    due_today:   due.length,
    new_cards:   never.length,
    mastered:    mastered.length,
    accuracy,
    streak_days: computeStreakDays(cards),
    by_subject:  bySubject,
  };
}

// Consecutive days (ending today or yesterday) with at least one review,
// derived from the last_reviewed_at timestamps across the deck.
function computeStreakDays(cards: SRCard[]): number {
  const reviewDays = new Set(
    cards
      .filter(c => c.last_reviewed_at)
      .map(c => (c.last_reviewed_at as string).slice(0, 10))
  );
  if (reviewDays.size === 0) return 0;

  const day = new Date();
  const dayISO = () => day.toISOString().slice(0, 10);

  // A streak is alive if the user reviewed today or yesterday
  if (!reviewDays.has(dayISO())) {
    day.setDate(day.getDate() - 1);
    if (!reviewDays.has(dayISO())) return 0;
  }

  let streak = 0;
  while (reviewDays.has(dayISO())) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

// ── Retention label ───────────────────────────────────────────────────────────
export function retentionLabel(card: SRCard): string {
  if (card.repetitions === 0) return 'New';
  if (card.interval_days >= 21) return 'Mastered';
  if (card.interval_days >= 7)  return 'Familiar';
  return 'Learning';
}

export function retentionColor(card: SRCard): string {
  if (card.repetitions === 0) return '#6B7280';   // gray
  if (card.interval_days >= 21) return '#10B981';  // green
  if (card.interval_days >= 7)  return '#3B82F6';  // blue
  return '#F59E0B';                                  // amber
}
