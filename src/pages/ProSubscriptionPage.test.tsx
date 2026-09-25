import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const cap = vi.hoisted(() => ({ native: true, platform: 'android' }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => cap.native, getPlatform: () => cap.platform } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn() } }));
vi.mock('@capacitor/toast', () => ({ Toast: { show: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/appRating', () => ({ maybePromptRating: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/hooks/useExperiment', () => ({ usePricingVariant: () => 'control', usePaywallCTAVariant: () => 'start_pro' }));
vi.mock('@/lib/experiments', () => ({ trackConversion: vi.fn(), getPricingConfig: () => ({}) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));
vi.mock('@/components/novo/NovoAvatar', () => ({ NovoAvatar: () => null }));
// Stable references: the page has an effect keyed on `user`, so a fresh object per render would loop forever.
const auth = vi.hoisted(() => ({ user: { id: 'u1' }, profile: { is_pro: false }, refetchProfile: () => Promise.resolve() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } },
}));

const purchase = vi.fn();
vi.mock('@/lib/iap', async () => {
  const actual = await vi.importActual<typeof import('@/lib/iap')>('@/lib/iap');
  return { ...actual, initRevenueCat: vi.fn().mockResolvedValue(undefined), restorePurchases: vi.fn().mockResolvedValue(false), IAP: { ...actual.IAP, purchase: (...a: unknown[]) => purchase(...a) } };
});

import ProSubscriptionPage from '@/pages/ProSubscriptionPage';

const cta = () => screen.getByRole('button', { name: /start pro|unlock everything|try pro free|subscribe|continue|upgrade/i });
const calls = () => invoke.mock.calls.map(c => (c[1] as { body?: { action?: string } })?.body?.action);

beforeEach(() => {
  invoke.mockReset(); purchase.mockReset();
  invoke.mockImplementation(async (_fn: string, opts: { body: { action: string } }) =>
    opts.body.action === 'get_status' ? { data: { is_pro: false, pro_expires_at: null, active_plan: null }, error: null } : { data: null, error: { message: 'unexpected' } });
  document.querySelectorAll('script[src*="razorpay"]').forEach(n => n.remove());
});

describe('ProSubscriptionPage — the /pro purchase screen and billing isolation', () => {
  it('renders the plans and prices (this is the screen every Pro gate must reach)', async () => {
    cap.native = true; cap.platform = 'android';
    render(<MemoryRouter><ProSubscriptionPage /></MemoryRouter>);
    expect(await screen.findByText('₹99')).toBeTruthy();
    expect(screen.getByText('₹699')).toBeTruthy();
  });

  it('NATIVE ANDROID: subscribing uses the in-app (Play/RevenueCat) purchase and NEVER loads Razorpay or creates a web order', async () => {
    cap.native = true; cap.platform = 'android';
    purchase.mockResolvedValue({ success: false, state: 'cancelled' });
    render(<MemoryRouter><ProSubscriptionPage /></MemoryRouter>);
    fireEvent.click(await waitFor(() => cta()));
    await waitFor(() => expect(purchase).toHaveBeenCalledTimes(1));
    expect(calls()).not.toContain('create_order');
    expect(document.querySelector('script[src*="razorpay"]')).toBeNull();
  });

  it('CONTROL: on the web the same button DOES take the Razorpay path (so the test above can actually fail)', async () => {
    cap.native = false; cap.platform = 'web';
    render(<MemoryRouter><ProSubscriptionPage /></MemoryRouter>);
    fireEvent.click(await waitFor(() => cta()));
    await waitFor(() => expect(document.querySelector('script[src*="razorpay"]')).not.toBeNull());
    expect(purchase).not.toHaveBeenCalled();
  });

  it('PENDING ACTIVATION: store purchase without backend confirmation shows calm pending copy, stays on /pro, never claims activation', async () => {
    cap.native = true; cap.platform = 'android';
    purchase.mockResolvedValue({ success: false, state: 'pending_activation' });
    render(<MemoryRouter><ProSubscriptionPage /></MemoryRouter>);
    fireEvent.click(await waitFor(() => cta()));
    expect(await screen.findByText(/activating pro now/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /check status/i })).toBeTruthy();
    expect(screen.queryByText(/pro is active|activated/i)).toBeNull();
    // pressing the main CTA again must NOT start a second store purchase
    invoke.mockResolvedValue({ data: { pro_active: false }, error: null });
    fireEvent.click(cta());
    await waitFor(() => expect(invoke.mock.calls.some(c => (c[1] as { body?: { action?: string } })?.body?.action === 'verify_revenuecat')).toBe(true));
    expect(purchase).toHaveBeenCalledTimes(1);
  });
});
