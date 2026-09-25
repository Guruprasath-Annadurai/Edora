import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TabBar, PRIMARY_TABS } from './TabBar';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { preferred_language: 'en' }, refetchProfile: vi.fn() }),
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn().mockRejectedValue(new Error('not on native')) },
  ImpactStyle: { Light: 'LIGHT' },
}));

function renderTabBar(initialPath: string) {
  return render(<MemoryRouter initialEntries={[initialPath]}><TabBar /></MemoryRouter>);
}

describe('TabBar — V5 five-tab navigation', () => {
  it('renders exactly the five V5 tabs in order: Home, Novo, Practice, Progress, Profile', () => {
    renderTabBar('/home');
    const links = screen.getAllByRole('link');
    expect(links.map(l => l.getAttribute('aria-label'))).toEqual(['Home', 'Novo', 'Practice', 'Progress', 'Profile']);
    expect(PRIMARY_TABS).toHaveLength(5);
  });

  it('has NO Battle (or Learn) tab in primary navigation', () => {
    renderTabBar('/home');
    expect(screen.queryByRole('link', { name: /battle/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /^learn$/i })).toBeNull();
    expect(PRIMARY_TABS.some(t => t.to === '/battle')).toBe(false);
  });

  it('points each tab at a real route', () => {
    renderTabBar('/home');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/home');
    expect(screen.getByRole('link', { name: 'Novo' })).toHaveAttribute('href', '/chat');
    expect(screen.getByRole('link', { name: 'Practice' })).toHaveAttribute('href', '/practice');
    expect(screen.getByRole('link', { name: 'Progress' })).toHaveAttribute('href', '/progress');
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile');
  });

  it('has an accessible navigation landmark', () => {
    renderTabBar('/home');
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('marks only the current tab with aria-current', () => {
    renderTabBar('/practice');
    expect(screen.getByRole('link', { name: 'Practice' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Novo' })).not.toHaveAttribute('aria-current', 'page');
  });

  it('marks Novo active on /chat (regression: Novo must only read as active on /chat)', () => {
    renderTabBar('/chat');
    expect(screen.getByRole('link', { name: 'Novo' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current', 'page');
  });

  it('gives every tab a tap target of at least 44px', () => {
    renderTabBar('/home');
    for (const l of screen.getAllByRole('link')) expect(l).toHaveStyle({ minHeight: '56px', minWidth: '44px' });
  });
});
