import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn().mockResolvedValue(undefined) }, ImpactStyle: { Light: 'LIGHT' } }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/appRating', () => ({ incrementSession: vi.fn() }));

const auth = vi.hoisted(() => ({ user: { id: 'u1' }, profile: null as unknown, refetchProfile: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

const db = vi.hoisted(() => ({ updates: [] as unknown[], updateError: null as unknown, existingPrefs: { theme: 'dark' } as unknown }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { study_preferences: db.existingPrefs }, error: null }) }) }),
      update: (u: unknown) => ({ eq: async () => { db.updates.push(u); return { error: db.updateError }; } }),
    }),
  },
}));

const nav = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')), useNavigate: () => nav }));

import OnboardingPage from '@/pages/OnboardingPage';
import { saveDraft, loadDraft } from '@/lib/onboardingState';
import { handleBack, resetBackStack } from '@/lib/backStack';

const renderPage = () => render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
const click = async (name: RegExp | string) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };
const pick = (name: RegExp | string) => fireEvent.click(screen.getByRole('radio', { name }));

beforeEach(() => { localStorage.clear(); db.updates = []; db.updateError = null; nav.mockReset(); auth.refetchProfile.mockClear(); resetBackStack(); });

describe('OnboardingPage (V5, 3 steps)', () => {
  it('starts on the exam step; Continue is disabled until an exam (or "Not sure yet") is chosen', () => {
    renderPage();
    expect(screen.getByText(/What are you preparing for/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Continue$/ }) as HTMLButtonElement).disabled).toBe(true);
    pick(/Not sure yet/i);
    expect((screen.getByRole('button', { name: /^Continue$/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers exactly the approved exam list, with no AI', () => {
    renderPage();
    const labels = screen.getAllByRole('radio').map(r => r.textContent);
    expect(labels).toEqual(['JEE Main', 'JEE Advanced', 'NEET', 'CBSE Class 10', 'CBSE Class 12', 'UPSC', 'CAT', 'Not sure yet / general study']);
  });

  it('full path: saves only real columns, exam never null, marks completion, then goes Home', async () => {
    renderPage();
    pick(/^NEET$/); await click(/^Continue$/);
    pick(/JEE \/ NEET/); fireEvent.click(screen.getByRole('button', { name: /Biology/ })); await click(/^Continue$/);
    pick(/Hindi/); await click(/Start learning/);
    await waitFor(() => expect(nav).toHaveBeenCalledWith('/home', { replace: true }));
    const u = db.updates[0] as Record<string, unknown> & { study_preferences: Record<string, unknown> };
    expect(u.exam_name).toBe('NEET');
    expect(u.study_level).toBe('jee_neet');
    expect(u.preferred_language).toBe('hi');
    expect(u).not.toHaveProperty('onboarding_completed');   // column does not exist in production
    expect(u).not.toHaveProperty('subjects');                // column does not exist in production
    expect(u.study_preferences.subjects).toEqual(['Biology']);
    expect(u.study_preferences.theme).toBe('dark');          // merged, not replaced
    expect(typeof u.study_preferences.onboarding_completed_at).toBe('string');
    expect(auth.refetchProfile).toHaveBeenCalled();
    expect(loadDraft('u1').examName).toBe('');               // draft cleared after success
  });

  it('"Skip for now" never traps: saves GENERAL with defaults and continues', async () => {
    renderPage();
    await click(/Skip for now/);
    await waitFor(() => expect(nav).toHaveBeenCalledWith('/home', { replace: true }));
    expect((db.updates[0] as Record<string, unknown>).exam_name).toBe('GENERAL');
  });

  it('a failed save keeps every answer, shows a retry, and does NOT navigate; retry then succeeds', async () => {
    db.updateError = { message: 'network down' };
    renderPage();
    pick(/^CAT$/); await click(/^Continue$/);
    pick(/School/); fireEvent.click(screen.getByRole('button', { name: /Physics/ })); await click(/^Continue$/);
    await click(/Start learning/);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(nav).not.toHaveBeenCalled();
    expect(loadDraft('u1')).toMatchObject({ examName: 'CAT', studyLevel: 'school', subjects: ['Physics'], step: 2 });
    db.updateError = null;
    await click(/Try again/);
    await waitFor(() => expect(nav).toHaveBeenCalledWith('/home', { replace: true }));
    expect((db.updates.at(-1) as Record<string, unknown>).exam_name).toBe('CAT');
  });

  it('resumes at the last step with previous answers after the app was killed', () => {
    saveDraft('u1', { step: 1, examName: 'UPSC', examDate: '', studyLevel: 'college', subjects: ['History'], language: 'en' });
    renderPage();
    expect(screen.getByText(/Your level and subjects/i)).toBeTruthy();
    expect(screen.getByRole('radio', { name: /College/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: /History/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Android Back goes to the previous step first (does not exit onboarding mid-flow)', async () => {
    renderPage();
    pick(/^CAT$/); await click(/^Continue$/);
    expect(screen.getByText(/Your level and subjects/i)).toBeTruthy();
    expect(handleBack()).toBe(true);
    expect(await screen.findByText(/What are you preparing for/i)).toBeTruthy();
    expect(handleBack()).toBe(false);   // on step 0 nothing consumes it -> default routing
  });

  it('exam date field appears only for a specific exam, not for GENERAL', () => {
    renderPage();
    pick(/^NEET$/); expect(screen.getByLabelText(/Exam date/i)).toBeTruthy();
    pick(/Not sure yet/i); expect(screen.queryByLabelText(/Exam date/i)).toBeNull();
  });

  it('touch targets: primary actions are at least 48px tall', () => {
    renderPage();
    for (const r of screen.getAllByRole('radio')) expect(parseInt(r.style.minHeight)).toBeGreaterThanOrEqual(48);
    expect(parseInt(screen.getByRole('button', { name: /^Continue$/ }).style.minHeight)).toBeGreaterThanOrEqual(48);
  });
});
