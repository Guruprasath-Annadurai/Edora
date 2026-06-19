// ─────────────────────────────────────────────────────────────────────────────
// useAchievementCard — detects milestone crossings and exposes a trigger
// for the shareable card modal. Call checkStreak/checkLevel after XP awards.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  streakMilestoneCard, levelMilestoneCard, mockScoreCard,
  type AchievementCardData,
} from '@/lib/achievementCard';

export function useAchievementCard() {
  const { profile } = useAuth();
  const [card, setCard] = useState<AchievementCardData | null>(null);

  const checkStreak = useCallback((streakDays: number) => {
    const data = streakMilestoneCard(streakDays, profile?.full_name ?? 'Student', profile?.avatar_url);
    if (data) setCard(data);
  }, [profile]);

  const checkLevel = useCallback((level: number) => {
    const data = levelMilestoneCard(level, profile?.full_name ?? 'Student', profile?.avatar_url);
    if (data) setCard(data);
  }, [profile]);

  const checkMockScore = useCallback((score: number, total: number, examName: string) => {
    const data = mockScoreCard(score, total, examName, profile?.full_name ?? 'Student', profile?.avatar_url);
    if (data) setCard(data);
  }, [profile]);

  const dismiss = useCallback(() => setCard(null), []);

  return { card, checkStreak, checkLevel, checkMockScore, dismiss };
}
