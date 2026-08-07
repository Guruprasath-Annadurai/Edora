import { test, expect } from '@playwright/test';

// Phase 4 (authenticated E2E test foundation) — data-driven smoke coverage
// across the core authenticated route surface. See navigation.spec.ts for
// the note on why this list is a reconstruction rather than a recovered
// original "30 flows" list.
//
// Each entry is a real route from src/App.tsx's authenticated route table,
// picked to cover every major feature area (study tools, gamification,
// analytics, settings) rather than every single one of the ~90 routes —
// a full enumeration would be brittle busywork with little added signal
// over one representative route per feature area. What each test asserts:
// the route renders under the real staging Supabase project, without the
// per-route error boundary firing (see components/ErrorBoundary.tsx) and
// without an unauthenticated bounce back to /login.
const ROUTES: { path: string; label: string }[] = [
  { path: '/home', label: 'home' },
  { path: '/learning', label: 'learning' },
  { path: '/tools', label: 'tools' },
  { path: '/chat', label: 'chat (Novo AI)' },
  { path: '/flashcard', label: 'flashcards' },
  { path: '/quiz', label: 'quiz' },
  { path: '/mock-test', label: 'mock test' },
  { path: '/pyq-bank', label: 'PYQ bank' },
  { path: '/roadmap', label: 'roadmap' },
  { path: '/planner', label: 'revision planner' },
  { path: '/formulas', label: 'formula sheet' },
  { path: '/notes', label: 'study notes' },
  { path: '/journal', label: 'mistake journal' },
  { path: '/spaced-review', label: 'spaced review' },
  { path: '/exam-prediction', label: 'exam prediction' },
  { path: '/weakness-radar', label: 'weakness radar' },
  { path: '/study-rooms', label: 'study rooms' },
  { path: '/battle', label: 'battle' },
  { path: '/leaderboard', label: 'leaderboard' },
  { path: '/achievements', label: 'achievements' },
  { path: '/analytics', label: 'analytics dashboard' },
  { path: '/profile', label: 'profile' },
  { path: '/account', label: 'account settings' },
  { path: '/reminders', label: 'study reminders' },
  { path: '/data-rights', label: 'data rights' },
  { path: '/diagnostics', label: 'diagnostics' },
];

for (const { path, label } of ROUTES) {
  test(`${label} (${path}) renders for an authenticated user`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/')));
    await expect(page.getByText('Page Error')).not.toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
}
