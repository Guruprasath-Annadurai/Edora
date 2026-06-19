import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

export interface AchievementDef {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  xp: number;
  color: string;
  bg: string;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: 'first_steps',  emoji: '🎯', title: 'First Steps',    desc: 'Complete your first quiz',         xp: 50,  color: '#EC4899', bg: '#FFF0F7' },
  { id: 'first_sprint', emoji: '⚡', title: 'Sprint Starter', desc: 'Complete your first focus sprint', xp: 50,  color: '#F59E0B', bg: '#FFF8EC' },
  { id: 'first_scan',   emoji: '📸', title: 'Digitizer',      desc: 'Scan your first document',         xp: 75,  color: '#06B6D4', bg: '#ECFEFF' },
  { id: 'perfect_quiz', emoji: '💯', title: 'Perfect Score',  desc: 'Get 100% on any quiz',             xp: 150, color: '#10B981', bg: '#ECFDF5' },
  { id: 'streak_3',     emoji: '🔥', title: 'On Fire',        desc: '3-day study streak',               xp: 75,  color: '#EF4444', bg: '#FFF1F2' },
  { id: 'streak_7',     emoji: '🌟', title: 'Week Warrior',   desc: '7-day study streak',               xp: 150, color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'streak_30',    emoji: '👑', title: 'Month Master',   desc: '30-day study streak',              xp: 500, color: '#8B5CF6', bg: '#F5F3FF' },
  { id: 'cards_50',     emoji: '📚', title: 'Card Collector', desc: 'Review 50 flashcards',             xp: 100, color: '#3B82F6', bg: '#EFF6FF' },
  { id: 'cards_100',    emoji: '🃏', title: 'Card Veteran',   desc: 'Review 100 flashcards',            xp: 200, color: '#5B6AF5', bg: '#EEF1FF' },
  { id: 'sprint_5',     emoji: '🏃', title: 'Sprint Addict',  desc: 'Complete 5 focus sprints',         xp: 150, color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'level_5',      emoji: '⭐', title: 'Rising Star',    desc: 'Reach Level 5',                    xp: 100, color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'level_10',     emoji: '🎓', title: 'Scholar',        desc: 'Reach Level 10',                   xp: 250, color: '#5B6AF5', bg: '#EEF1FF' },
  { id: 'early_bird',   emoji: '🌅', title: 'Early Bird',     desc: 'Study before 8 AM',                xp: 100, color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'night_owl',    emoji: '🦉', title: 'Night Owl',      desc: 'Study after 11 PM',                xp: 100, color: '#8B5CF6', bg: '#F5F3FF' },
];

export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENT_DEFS.map(d => [d.id, d]));

// ── Load all unlocked achievement IDs for a user ─────────────────────────────
export async function loadUnlockedIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('achievements')
    .select('achievement_id')
    .eq('user_id', userId);
  if (error) console.error('[achievements] loadUnlockedIds error:', error.message);
  return new Set((data ?? []).map((r: { achievement_id: string }) => r.achievement_id));
}

// ── Try to unlock one or more achievements ───────────────────────────────────
// Returns the defs that were newly unlocked (not already held by the user)
export async function tryUnlock(
  userId: string,
  ids: string[],
  alreadyUnlocked: Set<string>,
): Promise<AchievementDef[]> {
  const toUnlock = ids.filter(id => !alreadyUnlocked.has(id) && ACHIEVEMENT_MAP[id]);
  if (!toUnlock.length) return [];

  const rows = toUnlock.map(achievement_id => ({ user_id: userId, achievement_id }));
  const { error } = await supabase.from('achievements').insert(rows);
  if (error) return []; // likely duplicate — already unlocked by another device

  // Award XP for each newly unlocked badge
  const totalXP = toUnlock.reduce((sum, id) => sum + (ACHIEVEMENT_MAP[id]?.xp ?? 0), 0);
  if (totalXP > 0) {
    await supabase.rpc('increment_xp', { user_id: userId, amount: totalXP });
  }

  const unlocked = toUnlock.map(id => ACHIEVEMENT_MAP[id]).filter(Boolean);
  for (const a of unlocked) {
    track('achievement_unlocked', { achievement_id: a.id, title: a.title, xp: a.xp });
  }
  return unlocked;
}

// ── Context-specific helpers called from feature pages ───────────────────────

export interface CheckContext {
  userId: string;
  unlocked: Set<string>;
  profile: { xp: number; streak_count: number };
  extras?: {
    quizScore?: number;
    quizTotal?: number;
    isFirstSprint?: boolean;
    isFirstScan?: boolean;
  };
}

export async function checkAchievements(ctx: CheckContext): Promise<AchievementDef[]> {
  const { userId, unlocked, profile, extras = {} } = ctx;
  const candidates: string[] = [];
  const hour = new Date().getHours();

  // Time-of-day
  if (hour < 8)  candidates.push('early_bird');
  if (hour >= 23) candidates.push('night_owl');

  // Streak milestones
  if (profile.streak_count >= 3)  candidates.push('streak_3');
  if (profile.streak_count >= 7)  candidates.push('streak_7');
  if (profile.streak_count >= 30) candidates.push('streak_30');

  // Level milestones (XP-based)
  const level = Math.floor(Math.sqrt(profile.xp / 100));
  if (level >= 5)  candidates.push('level_5');
  if (level >= 10) candidates.push('level_10');

  // Quiz-specific
  if (extras.quizScore !== undefined) {
    candidates.push('first_steps');
    if (extras.quizTotal && extras.quizScore === extras.quizTotal && extras.quizTotal > 0) {
      candidates.push('perfect_quiz');
    }
  }

  // Sprint-specific
  if (extras.isFirstSprint) candidates.push('first_sprint');

  // Scan-specific
  if (extras.isFirstScan) candidates.push('first_scan');

  return tryUnlock(userId, candidates, unlocked);
}

// ── Sprint count check (needs a DB query) ────────────────────────────────────
export async function checkSprintCountAchievements(
  userId: string,
  unlocked: Set<string>,
): Promise<AchievementDef[]> {
  const { count } = await supabase
    .from('sprint_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('completed', true);
  const candidates: string[] = [];
  if ((count ?? 0) >= 5) candidates.push('sprint_5');
  return tryUnlock(userId, candidates, unlocked);
}

// ── Flashcard review count check ─────────────────────────────────────────────
export async function checkFlashcardCountAchievements(
  userId: string,
  unlocked: Set<string>,
): Promise<AchievementDef[]> {
  const { count } = await supabase
    .from('flashcards')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gt('repetitions', 0);
  const candidates: string[] = [];
  if ((count ?? 0) >= 50)  candidates.push('cards_50');
  if ((count ?? 0) >= 100) candidates.push('cards_100');
  return tryUnlock(userId, candidates, unlocked);
}
