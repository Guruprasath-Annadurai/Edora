// Daily Mission completion — called from the pages where each task genuinely
// happens (QuizPage on quiz submit, FlashcardPage on session complete,
// ChatPage on message send), not from a self-report button. HomePage's
// "Mark X done ✓" buttons let users award themselves the mission (and its
// +50 XP bonus) without doing anything — this is the single source of truth
// that replaces them.
import { supabase } from '@/lib/supabase';

export type MissionTaskId = 'quiz' | 'cards' | 'chat';

function missionKey(uid: string) {
  return `edora_mission_${uid}_${new Date().toISOString().slice(0, 10)}`;
}

export async function markMissionTaskComplete(userId: string, taskId: MissionTaskId): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from('daily_mission_completions')
    .select('quiz_done,cards_done,chat_done,bonus_xp_awarded')
    .eq('user_id', userId).eq('mission_date', today)
    .maybeSingle();

  const next = {
    quiz_done:  taskId === 'quiz'  ? true : !!existing?.quiz_done,
    cards_done: taskId === 'cards' ? true : !!existing?.cards_done,
    chat_done:  taskId === 'chat'  ? true : !!existing?.chat_done,
  };
  const allDone = next.quiz_done && next.cards_done && next.chat_done;
  const shouldAwardBonus = allDone && !existing?.bonus_xp_awarded;

  await supabase.from('daily_mission_completions').upsert({
    user_id: userId,
    mission_date: today,
    ...next,
    bonus_xp_awarded: shouldAwardBonus || !!existing?.bonus_xp_awarded,
    ...(allDone ? { completed_at: new Date().toISOString() } : {}),
  }, { onConflict: 'user_id,mission_date' });

  if (shouldAwardBonus) {
    await supabase.rpc('increment_xp', { user_id: userId, amount: 50 }).then(undefined, () => {});
  }

  // Mirror into localStorage so HomePage's optimistic initial-render cache
  // (read before its own Supabase fetch resolves) is correct on next visit.
  try {
    const key = missionKey(userId);
    const s = JSON.parse(localStorage.getItem(key) ?? '{}');
    localStorage.setItem(key, JSON.stringify({ ...s, [taskId]: true }));
  } catch { /* best-effort */ }
}
