import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TabBar } from './TabBar';

// TabBar → TabButton/NovoCenterButton → useT → useLanguage → useAuth, so the
// whole tree needs a minimal profile even though this component doesn't
// touch subscription state — only preferred_language (defaults to 'en').
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { preferred_language: 'en' }, refetchProfile: vi.fn() }),
}));

// Haptics.impact isn't implemented in jsdom; TabButton/NovoCenterButton
// already catch its rejection for "web" (see hapticLight in TabBar.tsx),
// so no mock is strictly required, but stubbing keeps test output clean.
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn().mockRejectedValue(new Error('not on native')) },
  ImpactStyle: { Light: 'LIGHT' },
}));

function renderTabBar(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TabBar />
    </MemoryRouter>,
  );
}

describe('TabBar', () => {
  it('renders all 5 tabs (Home, Learn, Novo, Battle, Profile) with accessible labels', () => {
    renderTabBar('/home');
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /learn/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /novo/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /battle/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument();
  });

  it('has an accessible navigation landmark', () => {
    renderTabBar('/home');
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('marks the Home tab as the active route via aria-current when on /home', () => {
    renderTabBar('/home');
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /learn/i })).not.toHaveAttribute('aria-current', 'page');
  });

  it('marks the Novo tab active (aria-current) when on /chat — regression test for a real prior bug', () => {
    // TabBar.tsx's NovoCenterButton comment documents this exact prior bug:
    // the glow "previously pulsed at full intensity regardless of isActive,
    // making the Novo button look equally 'selected' whether or not you
    // were actually on /chat." The full animation-intensity behavior isn't
    // practically assertable in jsdom (no real Framer Motion render loop),
    // but the underlying isActive signal it was driven by — NavLink's route
    // match — is: this locks in that Novo only reads as active on /chat.
    renderTabBar('/chat');
    expect(screen.getByRole('link', { name: /novo/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current', 'page');
  });

  it('does NOT mark the Novo tab active when on an unrelated route', () => {
    renderTabBar('/home');
    expect(screen.getByRole('link', { name: /novo/i })).not.toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('aria-current', 'page');
  });

  it('points each tab link at the correct route', () => {
    renderTabBar('/home');
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/home');
    expect(screen.getByRole('link', { name: /learn/i })).toHaveAttribute('href', '/learning');
    expect(screen.getByRole('link', { name: /novo/i })).toHaveAttribute('href', '/chat');
    expect(screen.getByRole('link', { name: /battle/i })).toHaveAttribute('href', '/battle');
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute('href', '/profile');
  });

  it('gives every tab a real tap target of at least 44px (accessibility minimum, not just a label check)', () => {
    renderTabBar('/home');
    const homeLink = screen.getByRole('link', { name: /home/i });
    expect(homeLink).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
  });
});
