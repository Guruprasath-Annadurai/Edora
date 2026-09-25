// V5 route / entry-point visibility policy (Day 5).
//
// Two independent things:
//  1. FLAG_ROUTES  — routes controlled by a remote flag (behaviour: redirect to /home, or a calm
//     "unavailable" screen). Routes are NEVER deleted; a flag turns them off.
//  2. CORE_ENTRY_PATHS — the only destinations offered by discovery surfaces (command palette / search,
//     Practice & Progress hubs). Everything else keeps working by direct link (many screens have a
//     "back" link to /tools or /learning), but is no longer advertised: unfinished / duplicated /
//     admin / experimental / legacy / Battle-related / outside the V5 core learning loop.
import type { AppFlags } from '@/lib/appFlags';

export type GateMode = 'redirect' | 'unavailable';
export interface FlagRule { flag: keyof AppFlags; mode: GateMode }

/** Battle-related (out of the V5 primary navigation) */
const BATTLE = ['/battle', '/boss-fight', '/tournament', '/streaks'];
/** Screens whose main action is AI generation */
const AI_GENERATION = ['/ai-quiz', '/quiz', '/study-pack', '/roadmap', '/lesson-plan', '/planner', '/photo-solver', '/mnemonics', '/exam-prediction'];

export const FLAG_ROUTES: Record<string, FlagRule> = {
  ...Object.fromEntries(BATTLE.map(p => [p, { flag: 'battle_enabled', mode: 'redirect' } as FlagRule])),
  '/pyq-bank': { flag: 'pyq_enabled', mode: 'redirect' },
  '/pro':      { flag: 'pro_enabled', mode: 'redirect' },
  '/chat':     { flag: 'novo_enabled', mode: 'unavailable' },
  ...Object.fromEntries(AI_GENERATION.map(p => [p, { flag: 'ai_generation_enabled', mode: 'unavailable' } as FlagRule])),
};

export function ruleForPath(pathname: string): FlagRule | null {
  const base = '/' + (pathname.split('?')[0].split('/')[1] ?? '');
  return FLAG_ROUTES[base] ?? null;
}

/** Discovery allowlist (search, palette, hubs). Paths are real, existing routes. */
export const CORE_ENTRY_PATHS = new Set([
  '/chat', '/quiz', '/flashcard', '/spaced-review', '/pyq-bank', '/mock-test', '/sprint', '/daily-session',
  '/weakness-radar', '/error-patterns', '/journal', '/analytics', '/confidence', '/achievements',
  '/roadmap', '/planner', '/pro', '/reminders', '/account',
]);

/** True if a discovery surface may show this destination given the current flags. */
export function isEntryVisible(pathname: string, flags: AppFlags): boolean {
  const base = '/' + (pathname.split('?')[0].split('/')[1] ?? '');
  if (!CORE_ENTRY_PATHS.has(base)) return false;
  const rule = FLAG_ROUTES[base];
  return !rule || flags[rule.flag] === true;
}

/** True if the route itself may be opened under the current flags (used by gates). */
export function isRouteEnabled(pathname: string, flags: AppFlags): boolean {
  const rule = ruleForPath(pathname);
  return !rule || flags[rule.flag] === true;
}
