import { HubList, type HubItem } from '@/components/hub/HubList';
import { ExamTargetNudge } from '@/components/exam/ExamTargetNudge';

// V5 Progress tab (shell). Day 7+ replaces this with mastery-driven progress; until then it indexes the
// existing progress/insight screens that belong to the core learning loop.
export const PROGRESS_ITEMS: HubItem[] = [
  { to: '/weakness-radar', title: 'Weak topics',        desc: 'Where you lose the most marks' },
  { to: '/error-patterns', title: 'Repeated mistakes',  desc: 'Patterns in the questions you get wrong' },
  { to: '/journal',        title: 'Mistake journal',    desc: 'Your saved mistakes and notes' },
  { to: '/analytics',      title: 'Study analytics',    desc: 'Time, accuracy and streaks' },
  { to: '/confidence',     title: 'Confidence',         desc: 'How sure you are, topic by topic' },
  { to: '/roadmap',        title: 'Study roadmap',      desc: 'Your plan to the exam date' },
  { to: '/achievements',   title: 'Achievements',       desc: 'Badges and milestones' },
];

export default function ProgressPage() {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 'calc(env(safe-area-inset-top) + 16px) 16px 120px' }}>
      <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: 24, fontWeight: 800, marginBottom: 16, color: 'var(--ink-950)' }}>Progress</h1>
      <ExamTargetNudge />
      <HubList items={PROGRESS_ITEMS} label="Progress options" />
    </div>
  );
}
