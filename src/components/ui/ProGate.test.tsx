import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProGate } from './ProGate';

// ProGate reads subscription state straight from useAuth()'s profile/user —
// a bug here is either a revenue leak (paywall doesn't show for a
// non-paying user) or a support ticket (a paying user gets blocked). Mocking
// the hook so each test controls the exact profile/user shape it needs.
const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

function renderGate(props: Partial<React.ComponentProps<typeof ProGate>> = {}) {
  return render(
    <MemoryRouter>
      <ProGate featureName="Voice Mode" {...props}>
        <div data-testid="gated-content">Real feature content</div>
      </ProGate>
    </MemoryRouter>,
  );
}

describe('ProGate', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('shows the paywall (not the feature) for a free user with no trial and no pro', () => {
    mockUseAuth.mockReturnValue({
      user: { created_at: '2020-01-01T00:00:00Z' }, // long past any trial window
      profile: { is_pro: false, pro_expires_at: null, exam_date: null },
    });
    renderGate();
    expect(screen.queryByTestId('gated-content')).not.toBeInTheDocument();
    expect(screen.getByText('Voice Mode')).toBeInTheDocument();
    expect(screen.getByText(/Upgrade to Pro/i)).toBeInTheDocument();
  });

  it('shows the real feature for an active pro subscriber', () => {
    mockUseAuth.mockReturnValue({
      user: { created_at: '2020-01-01T00:00:00Z' },
      profile: { is_pro: true, pro_expires_at: null, exam_date: null },
    });
    renderGate();
    expect(screen.getByTestId('gated-content')).toBeInTheDocument();
  });

  it('shows the real feature for a pro subscriber whose expiry is in the future', () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    mockUseAuth.mockReturnValue({
      user: { created_at: '2020-01-01T00:00:00Z' },
      profile: { is_pro: true, pro_expires_at: future, exam_date: null },
    });
    renderGate();
    expect(screen.getByTestId('gated-content')).toBeInTheDocument();
  });

  it('shows the paywall for a pro subscriber whose expiry is in the past — a lapsed subscription must not stay unlocked', () => {
    const past = new Date(Date.now() - 30 * 86_400_000).toISOString();
    mockUseAuth.mockReturnValue({
      user: { created_at: '2020-01-01T00:00:00Z' },
      profile: { is_pro: true, pro_expires_at: past, exam_date: null },
    });
    renderGate();
    expect(screen.queryByTestId('gated-content')).not.toBeInTheDocument();
  });

  it('shows the real feature during the free-trial window (isInFreeTrial), even without is_pro', () => {
    mockUseAuth.mockReturnValue({
      user: { created_at: new Date().toISOString() }, // account created just now — inside trial
      profile: { is_pro: false, pro_expires_at: null, exam_date: null },
    });
    renderGate();
    expect(screen.getByTestId('gated-content')).toBeInTheDocument();
  });

  it('unlocks the feature via the exam-sprint bypass when the exam is within 30 days, even without pro', () => {
    const examIn10Days = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    mockUseAuth.mockReturnValue({
      user: { created_at: '2020-01-01T00:00:00Z' },
      profile: { is_pro: false, pro_expires_at: null, exam_date: examIn10Days },
    });
    renderGate();
    expect(screen.getByTestId('gated-content')).toBeInTheDocument();
    expect(screen.getByText(/Free for your final sprint/i)).toBeInTheDocument();
  });

  it('does NOT apply the exam-sprint bypass when the exam is more than 30 days away', () => {
    const examIn60Days = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    mockUseAuth.mockReturnValue({
      user: { created_at: '2020-01-01T00:00:00Z' },
      profile: { is_pro: false, pro_expires_at: null, exam_date: examIn60Days },
    });
    renderGate();
    expect(screen.queryByTestId('gated-content')).not.toBeInTheDocument();
  });

  it('does NOT apply the exam-sprint bypass for a past exam date', () => {
    const examYesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    mockUseAuth.mockReturnValue({
      user: { created_at: '2020-01-01T00:00:00Z' },
      profile: { is_pro: false, pro_expires_at: null, exam_date: examYesterday },
    });
    renderGate();
    expect(screen.queryByTestId('gated-content')).not.toBeInTheDocument();
  });

  it('does not show the exam-sprint banner for an actual pro user (even inside the sprint window)', () => {
    const examIn10Days = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    mockUseAuth.mockReturnValue({
      user: { created_at: '2020-01-01T00:00:00Z' },
      profile: { is_pro: true, pro_expires_at: null, exam_date: examIn10Days },
    });
    renderGate();
    expect(screen.getByTestId('gated-content')).toBeInTheDocument();
    expect(screen.queryByText(/Free for your final sprint/i)).not.toBeInTheDocument();
  });

  it('sheet mode: always renders children, and only shows the sheet paywall when not pro AND open=true', () => {
    mockUseAuth.mockReturnValue({
      user: { created_at: '2020-01-01T00:00:00Z' },
      profile: { is_pro: false, pro_expires_at: null, exam_date: null },
    });
    renderGate({ sheet: true, open: true });
    // Children always render in sheet mode (the underlying page stays visible).
    expect(screen.getByTestId('gated-content')).toBeInTheDocument();
    // The sheet overlay's own CTA text should be present since open && !pro.
    expect(screen.getByText(/Upgrade to unlock this and more/i)).toBeInTheDocument();
  });

  it('sheet mode: does not show the paywall sheet for a pro user even if open=true', () => {
    mockUseAuth.mockReturnValue({
      user: { created_at: '2020-01-01T00:00:00Z' },
      profile: { is_pro: true, pro_expires_at: null, exam_date: null },
    });
    renderGate({ sheet: true, open: true });
    expect(screen.getByTestId('gated-content')).toBeInTheDocument();
    expect(screen.queryByText(/Upgrade to unlock this and more/i)).not.toBeInTheDocument();
  });
});
