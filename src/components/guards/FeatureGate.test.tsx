import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_APP_FLAGS, type AppFlags } from '@/lib/appFlags';

const state = vi.hoisted(() => ({ flags: {} as Record<string, boolean> }));
vi.mock('@/hooks/useAppFlags', () => ({
  useAppFlags: () => state.flags,
  useAppFlag: (n: string) => state.flags[n] === true,
}));

import { GatedOutlet } from '@/components/guards/FeatureGate';

function at(path: string, flags: Partial<AppFlags>) {
  state.flags = { ...DEFAULT_APP_FLAGS, ...flags } as Record<string, boolean>;
  const pages = ['/home', '/battle', '/pyq-bank', '/pro', '/chat', '/quiz', '/flashcard', '/boss-fight'];
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<GatedOutlet />}>
          {pages.map(p => <Route key={p} path={p} element={<div>PAGE {p}</div>} />)}
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('GatedOutlet (single enforcement point for flagged routes, incl. deep links)', () => {
  it('battle_enabled=false: /battle and /boss-fight redirect to /home', () => {
    at('/battle', {}); expect(screen.getByText('PAGE /home')).toBeTruthy();
  });
  it('battle_enabled=false: /boss-fight redirects to /home', () => {
    at('/boss-fight', {}); expect(screen.getByText('PAGE /home')).toBeTruthy();
  });
  it('control: battle_enabled=true opens /battle', () => {
    at('/battle', { battle_enabled: true }); expect(screen.getByText('PAGE /battle')).toBeTruthy();
  });
  it('pyq_enabled=false: PYQ deep link redirects home (gracefully hidden)', () => {
    at('/pyq-bank', { pyq_enabled: false }); expect(screen.getByText('PAGE /home')).toBeTruthy();
  });
  it('pro_enabled=false: /pro redirects home (no purchase entry)', () => {
    at('/pro', { pro_enabled: false }); expect(screen.getByText('PAGE /home')).toBeTruthy();
  });
  it('novo_enabled=false: /chat shows a calm unavailable state with a way out (not a blank/redirect)', () => {
    at('/chat', { novo_enabled: false });
    expect(screen.getByText(/Novo is taking a short break/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Go to Practice/i })).toHaveAttribute('href', '/practice');
    expect(screen.getByRole('link', { name: /Back to Home/i })).toHaveAttribute('href', '/home');
    expect(screen.queryByText('PAGE /chat')).toBeNull();
  });
  it('ai_generation_enabled=false: generation screens show the paused state; non-generation screens are untouched', () => {
    at('/quiz', { ai_generation_enabled: false });
    expect(screen.getByText(/Question generation is paused/i)).toBeTruthy();
  });
  it('ai_generation_enabled=false does not affect flashcards', () => {
    at('/flashcard', { ai_generation_enabled: false }); expect(screen.getByText('PAGE /flashcard')).toBeTruthy();
  });
  it('defaults (flags not loaded / network failure): Battle stays hidden, core screens work', () => {
    at('/battle', {}); expect(screen.queryByText('PAGE /battle')).toBeNull();
    at('/chat', {}); expect(screen.getByText('PAGE /chat')).toBeTruthy();
  });
});
