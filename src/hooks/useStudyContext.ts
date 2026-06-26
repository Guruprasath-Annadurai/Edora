// ─────────────────────────────────────────────────────────────────────────────
// useStudyContext — pulls recent study activity for Novo contextual awareness
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface StudyContextLesson {
  lesson_id: string;        // e.g. "sc10-c1-l3"
  completed_at: string;     // ISO
  xp_earned: number;
}

export interface StudyContextQuiz {
  topic: string;
  score: number;
  total: number;
  created_at: string;
}

export interface StudyContext {
  recentLessons: StudyContextLesson[];   // last 5 completed lessons
  recentQuizTopics: StudyContextQuiz[];  // last 3 quiz topics
  todayXP: number;                       // XP earned today from lesson_progress
  streak: number;                        // from profile
}

const EMPTY: StudyContext = {
  recentLessons: [],
  recentQuizTopics: [],
  todayXP: 0,
  streak: 0,
};

export function useStudyContext(userId: string | undefined, streak: number): {
  ctx: StudyContext;
  loading: boolean;
} {
  const [ctx, setCtx]     = useState<StudyContext>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [lessonsRes, quizzesRes] = await Promise.all([
          supabase
            .from('lesson_progress')
            .select('lesson_id, completed_at, xp_earned')
            .eq('user_id', userId)
            .eq('completed', true)
            .order('completed_at', { ascending: false })
            .limit(5),
          supabase
            .from('quiz_sessions')
            .select('topic, score, total_questions, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(3),
        ]);

        if (cancelled) return;

        const recentLessons: StudyContextLesson[] = (lessonsRes.data ?? []).map(r => ({
          lesson_id: r.lesson_id,
          completed_at: r.completed_at ?? new Date().toISOString(),
          xp_earned: r.xp_earned ?? 0,
        }));

        const todayXP = recentLessons
          .filter(l => new Date(l.completed_at) >= todayStart)
          .reduce((sum, l) => sum + l.xp_earned, 0);

        const recentQuizTopics: StudyContextQuiz[] = (quizzesRes.data ?? []).map(r => ({
          topic: r.topic ?? 'General',
          score: r.score ?? 0,
          total: r.total_questions ?? 0,
          created_at: r.created_at,
        }));

        setCtx({ recentLessons, recentQuizTopics, todayXP, streak });
      } catch {
        // non-critical — Novo falls back to generic mode
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, streak]);

  return { ctx, loading };
}

// ── Helpers used by ChatPage ──────────────────────────────────────────────────

// Parse a lesson_id like "sc10-c1-l3" to a human-readable description
export function lessonIdToLabel(id: string): string {
  const parts = id.split('-');
  // e.g. sc10 → Science Class 10, ma10 → Maths Class 10, ph12 → Physics Class 12
  const subjectMap: Record<string, string> = {
    sc: 'Science', ma: 'Mathematics', ph: 'Physics',
    ch: 'Chemistry', bi: 'Biology', en: 'English',
  };
  const subjectCode = parts[0]?.replace(/\d+/g, '') ?? '';
  const classNum    = parts[0]?.replace(/\D/g, '') ?? '';
  const chapterNum  = parts[1]?.replace('c', '') ?? '';
  const lessonNum   = parts[2]?.replace('l', '') ?? '';
  const subject     = subjectMap[subjectCode] ?? 'Subject';
  if (classNum && chapterNum && lessonNum) {
    return `${subject} Class ${classNum} — Chapter ${chapterNum}, Lesson ${lessonNum}`;
  }
  return id;
}

// Build the study context block for Novo's system prompt
export function buildStudyContextBlock(ctx: StudyContext): string {
  if (ctx.recentLessons.length === 0 && ctx.recentQuizTopics.length === 0) return '';

  const lines: string[] = ['STUDENT\'S RECENT STUDY ACTIVITY (use this to personalise your responses):'];

  if (ctx.todayXP > 0) {
    lines.push(`• Today's progress: ${ctx.todayXP} XP earned from completed lessons`);
  }
  if (ctx.streak > 1) {
    lines.push(`• Study streak: ${ctx.streak} days in a row — acknowledge this when relevant`);
  }

  if (ctx.recentLessons.length > 0) {
    lines.push('• Recently completed lessons (most recent first):');
    ctx.recentLessons.forEach(l => {
      const when = new Date(l.completed_at);
      const now  = new Date();
      const diffH = Math.round((now.getTime() - when.getTime()) / (1000 * 60 * 60));
      const timeLabel = diffH < 1 ? 'just now' : diffH < 24 ? `${diffH}h ago` : `${Math.round(diffH / 24)}d ago`;
      lines.push(`  - ${lessonIdToLabel(l.lesson_id)} (${timeLabel})`);
    });
    lines.push('  → If the student asks about any of these topics, you already know what they just studied. Reference it naturally.');
  }

  if (ctx.recentQuizTopics.length > 0) {
    lines.push('• Recent quiz performance:');
    ctx.recentQuizTopics.forEach(q => {
      const pct = q.total > 0 ? Math.round((q.score / q.total) * 100) : 0;
      const verdict = pct >= 70 ? 'strong' : pct >= 40 ? 'partial understanding' : 'needs reinforcement';
      lines.push(`  - ${q.topic}: ${pct}% (${verdict})`);
    });
  }

  lines.push('Use this data to give contextually relevant responses. If they just studied a topic and ask about it, confirm what they learned and build on it.');

  return lines.join('\n');
}

// Generate personalised quick-start chips for the empty state
export function getPersonalisedChips(
  ctx: StudyContext,
  weakTopics: string[],
  examName: string | null,
): string[] {
  const chips: string[] = [];

  // First: most recently studied lesson topic
  if (ctx.recentLessons.length > 0) {
    const latest = ctx.recentLessons[0];
    const label = lessonIdToLabel(latest.lesson_id);
    const subject = label.split(' — ')[0];
    chips.push(`Explain more about what I just studied in ${subject}`);
  }

  // Second: a weak quiz topic if available
  const weakQuiz = ctx.recentQuizTopics.find(q => {
    const pct = q.total > 0 ? (q.score / q.total) : 1;
    return pct < 0.6;
  });
  if (weakQuiz) {
    chips.push(`I scored ${Math.round((weakQuiz.score / weakQuiz.total) * 100)}% on ${weakQuiz.topic} — help me understand it better`);
  }

  // Third: weak topic from Novo memory
  if (weakTopics[0]) {
    chips.push(`I keep struggling with ${weakTopics[0]} — can you teach it from scratch?`);
  }

  // Fallbacks based on exam
  if (examName?.toLowerCase().includes('jee')) {
    chips.push(...['Explain a tough JEE concept step by step', 'Give me a JEE-level problem to solve', 'What should I focus on this week for JEE?']);
  } else if (examName?.toLowerCase().includes('neet')) {
    chips.push(...['Help me understand a NEET Biology concept', 'Give me a NEET MCQ to practice', 'What are the most important NEET topics?']);
  } else {
    chips.push(...['Help me understand a concept I\'m stuck on', 'Quiz me on a topic I choose', 'Create a quick flashcard quiz for me']);
  }

  // Return max 5 unique chips
  return [...new Set(chips)].slice(0, 5);
}
