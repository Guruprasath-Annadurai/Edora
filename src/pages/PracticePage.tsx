import { HubList, type HubItem } from '@/components/hub/HubList';
import { ExamTargetNudge } from '@/components/exam/ExamTargetNudge';

// V5 Practice tab (shell). Day 7+ replaces this with the plan-driven Practice experience; until then it is a
// calm, truthful index of existing practice modes. Entries respect remote flags (PYQ, AI generation).
export const PRACTICE_ITEMS: HubItem[] = [
  { to: '/quiz',          title: 'Practice a topic',           desc: 'Answer a short set of questions on a topic you choose' },
  { to: '/flashcard',     title: 'Flashcards',                 desc: 'Review cards that are due' },
  { to: '/spaced-review', title: 'Review schedule',            desc: 'See what to revise and when' },
  { to: '/pyq-bank',      title: 'Previous-year questions',    desc: 'Questions from past exam papers' },
  { to: '/mock-test',     title: 'Mock test',                  desc: 'A timed, full-length practice test' },
  { to: '/daily-session', title: 'Daily session',              desc: 'A short curated session for today' },
  { to: '/sprint',        title: 'Focus sprint',               desc: '25 focused minutes' },
];

export default function PracticePage() {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 'calc(env(safe-area-inset-top) + 16px) 16px 120px' }}>
      <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: 24, fontWeight: 800, marginBottom: 16, color: 'var(--ink-950)' }}>Practice</h1>
      <ExamTargetNudge />
      <HubList items={PRACTICE_ITEMS} label="Practice options" />
    </div>
  );
}
