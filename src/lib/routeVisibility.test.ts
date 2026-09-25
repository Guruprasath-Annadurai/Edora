import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_APP_FLAGS, type AppFlags } from '@/lib/appFlags';
import { FLAG_ROUTES, CORE_ENTRY_PATHS, ruleForPath, isEntryVisible, isRouteEnabled } from '@/lib/routeVisibility';
import { PRIMARY_TABS } from '@/components/layout/TabBar';
import { PRACTICE_ITEMS } from '@/pages/PracticePage';
import { PROGRESS_ITEMS } from '@/pages/ProgressPage';
import { FEATURE_REGISTRY, searchFeatures } from '@/lib/featureRegistry';

const on = (over: Partial<AppFlags> = {}): AppFlags => ({ ...DEFAULT_APP_FLAGS, ...over } as AppFlags);

describe('flag -> route rules', () => {
  it('Battle routes are controlled by battle_enabled (default OFF)', () => {
    expect(DEFAULT_APP_FLAGS.battle_enabled).toBe(false);
    for (const p of ['/battle', '/boss-fight', '/tournament', '/streaks']) {
      expect(ruleForPath(p)?.flag).toBe('battle_enabled');
      expect(isRouteEnabled(p, on())).toBe(false);
      expect(isRouteEnabled(p, on({ battle_enabled: true }))).toBe(true);
    }
  });
  it('new_home_enabled stays false by default (V5 Home not approved)', () => expect(DEFAULT_APP_FLAGS.new_home_enabled).toBe(false));
  it('pyq / pro / novo / ai-generation each map to their flag', () => {
    expect(ruleForPath('/pyq-bank')?.flag).toBe('pyq_enabled');
    expect(ruleForPath('/pro')?.flag).toBe('pro_enabled');
    expect(ruleForPath('/chat')?.flag).toBe('novo_enabled');
    expect(ruleForPath('/ai-quiz')?.flag).toBe('ai_generation_enabled');
    expect(ruleForPath('/quiz')?.flag).toBe('ai_generation_enabled');
  });
  it('Novo & generation are "unavailable" screens; Battle/PYQ/Pro redirect home', () => {
    expect(FLAG_ROUTES['/chat'].mode).toBe('unavailable');
    expect(FLAG_ROUTES['/quiz'].mode).toBe('unavailable');
    expect(FLAG_ROUTES['/pyq-bank'].mode).toBe('redirect');
    expect(FLAG_ROUTES['/pro'].mode).toBe('redirect');
  });
  it('an ordinary route has no rule; query strings and sub-paths resolve to their base', () => {
    expect(ruleForPath('/flashcard')).toBeNull();
    expect(ruleForPath('/quiz?subject=Physics&instant=true')?.flag).toBe('ai_generation_enabled');
  });
  it('turning a flag off disables its routes (pyq/pro/novo/ai)', () => {
    expect(isRouteEnabled('/pyq-bank', on({ pyq_enabled: false }))).toBe(false);
    expect(isRouteEnabled('/pro', on({ pro_enabled: false }))).toBe(false);
    expect(isRouteEnabled('/chat', on({ novo_enabled: false }))).toBe(false);
    expect(isRouteEnabled('/quiz', on({ ai_generation_enabled: false }))).toBe(false);
  });
});

describe('discovery surfaces', () => {
  it('a flagged-off destination is not offered; a non-core destination is never offered', () => {
    expect(isEntryVisible('/pyq-bank', on({ pyq_enabled: false }))).toBe(false);
    expect(isEntryVisible('/pyq-bank', on())).toBe(true);
    expect(isEntryVisible('/battle', on({ battle_enabled: true }))).toBe(false);   // not core, even when enabled
    expect(isEntryVisible('/formula-ar', on())).toBe(false);
    expect(isEntryVisible('/eval', on())).toBe(false);
  });
  it('command palette search never returns Battle / experimental / admin entries', () => {
    const q = (s: string) => searchFeatures(s, on({ battle_enabled: true })).map(f => f.to);
    expect(q('battle')).not.toContain('/battle');
    expect(q('boss')).toEqual([]);
    expect(q('leaderboard')).toEqual([]);
    expect(q('flashcards')).toContain('/flashcard');
  });
  it('registry entries that are offered point at real routes (no /pyq, /mistake-journal dead links)', () => {
    const paths = appRoutePaths();
    for (const f of FEATURE_REGISTRY.filter(f => CORE_ENTRY_PATHS.has(f.to))) expect(paths.has(f.to), f.to).toBe(true);
  });
});

function appRoutePaths(): Set<string> {
  const src = readFileSync('src/App.tsx', 'utf8');
  return new Set([...src.matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1]));
}

describe('no route dead-ends', () => {
  const paths = appRoutePaths();
  it('every primary tab is a real route', () => { for (const t of PRIMARY_TABS) expect(paths.has(t.to), t.to).toBe(true); });
  it('every Practice / Progress hub destination is a real route and a core destination', () => {
    for (const i of [...PRACTICE_ITEMS, ...PROGRESS_ITEMS]) { expect(paths.has(i.to), i.to).toBe(true); expect(CORE_ENTRY_PATHS.has(i.to), i.to).toBe(true); }
  });
  it('/pro, /setup-exam, /practice, /progress exist (no broken link)', () => {
    for (const p of ['/pro', '/setup-exam', '/practice', '/progress', '/onboarding']) expect(paths.has(p), p).toBe(true);
  });
  it('the back-link targets used across pages (/tools, /learning) still exist', () => { expect(paths.has('/tools')).toBe(true); expect(paths.has('/learning')).toBe(true); });
  it('Battle routes still exist (feature-gated, not deleted)', () => { for (const p of ['/battle', '/boss-fight', '/tournament']) expect(paths.has(p)).toBe(true); });
});
