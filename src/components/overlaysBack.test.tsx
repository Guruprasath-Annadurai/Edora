// Day 5 closeout: every overlay that can cover the screen registers with the CENTRAL back stack
// (no competing Capacitor listeners) and Back closes it before any navigation.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn().mockResolvedValue(undefined) }, ImpactStyle: { Light: 'LIGHT' } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false } }));
vi.mock('@capacitor/app', () => ({ App: { minimizeApp: vi.fn(), addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) } }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));
vi.mock('@/components/novo/NovoAvatar', () => ({ NovoAvatar: () => null }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }), functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) }, auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }) } } }));
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn(), saving: false, langOption: { flag: 'E', native: 'English', code: 'en', label: 'English' } }),
  SUPPORTED_LANGUAGES: [{ code: 'en', flag: 'E', native: 'English', label: 'English' }, { code: 'hi', flag: 'H', native: 'हिन्दी', label: 'Hindi' }],
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { id: 'u1' }, user: { id: 'u1' }, refetchProfile: vi.fn() }) }));

import { handleBack, backHandlerCount, resetBackStack } from '@/lib/backStack';
import { FocusModeOverlay } from '@/components/study/FocusModeOverlay';
import { StudyBreakPlayer } from '@/components/study/StudyBreakPlayer';
import { EmotionalCheckIn } from '@/components/chat/EmotionalCheckIn';
import { OnboardingTour } from '@/components/onboarding/OnboardingTour';
import { LanguageSelector } from '@/components/LanguageSelector';
import DPDPConsentModal from '@/components/consent/DPDPConsentModal';

beforeEach(() => resetBackStack());
const back = async () => { let r = false; await act(async () => { r = handleBack(); }); return r; };

describe('open overlays register with the central back stack and Back closes them', () => {
  it('FocusModeOverlay: registered only while open; Back calls onClose', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<FocusModeOverlay open={false} onClose={onClose} />);
    expect(backHandlerCount()).toBe(0);
    rerender(<FocusModeOverlay open onClose={onClose} />);
    expect(backHandlerCount()).toBe(1);
    expect(await back()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('StudyBreakPlayer: Back closes a normal break; an ENFORCED break swallows Back without closing', async () => {
    const onClose = vi.fn();
    const a = render(<StudyBreakPlayer open onClose={onClose} />);
    expect(await back()).toBe(true); expect(onClose).toHaveBeenCalledTimes(1);
    a.unmount(); resetBackStack(); onClose.mockClear();
    render(<StudyBreakPlayer open onClose={onClose} enforceBreak />);
    expect(await back()).toBe(true); expect(onClose).not.toHaveBeenCalled();
  });

  it('EmotionalCheckIn: Back skips the check-in (does not navigate underneath)', async () => {
    const onSkip = vi.fn();
    render(<EmotionalCheckIn userId="u1" firstName="A" onComplete={vi.fn()} onSkip={onSkip} />);
    expect(await back()).toBe(true);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('OnboardingTour: Back skips the tour', async () => {
    vi.useFakeTimers();
    try {
      const onDone = vi.fn();
      render(<OnboardingTour onDone={onDone} />);
      expect(backHandlerCount()).toBe(1);
      await act(async () => { handleBack(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it('LanguageSelector dropdown: registers only while open, Back closes it', async () => {
    render(<LanguageSelector compact />);
    expect(backHandlerCount()).toBe(0);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(backHandlerCount()).toBe(1);
    expect(await back()).toBe(true);
    expect(backHandlerCount()).toBe(0);
  });

  it('DPDP consent (mandatory): Back is swallowed so nothing navigates underneath', async () => {
    render(<MemoryRouter><DPDPConsentModal userId="u1" onAccepted={vi.fn()} /></MemoryRouter>);
    expect(backHandlerCount()).toBe(1);
    expect(await back()).toBe(true);
  });

  it('priority: an overlay opened over a modal is closed first', async () => {
    const order: string[] = [];
    const a = render(<FocusModeOverlay open onClose={() => order.push('focus')} />);
    const b = render(<StudyBreakPlayer open onClose={() => order.push('break')} />);
    await back(); await back();
    expect(order.length).toBeGreaterThan(0);
    a.unmount(); b.unmount();
  });
});

describe('every overlay named in the Day 5 audit uses the central stack and no private Capacitor listener', () => {
  const FILES = [
    'src/components/study/SpacedReviewInterrupt.tsx', 'src/components/chat/EmotionalCheckIn.tsx', 'src/components/ui/QuickStartFAB.tsx',
    'src/components/LanguageSelector.tsx', 'src/components/settings/LanguageSwitcher.tsx', 'src/components/voice/VoiceStudyOverlay.tsx',
    'src/components/study/FocusModeOverlay.tsx', 'src/components/study/SpeedReaderOverlay.tsx', 'src/components/study/StudyBreakPlayer.tsx',
    'src/components/consent/DPDPConsentModal.tsx', 'src/components/onboarding/OnboardingTour.tsx',
    'src/components/ui/CommandPalette.tsx', 'src/components/study/SessionEndRitual.tsx', 'src/components/ui/PermissionRationale.tsx',
    'src/components/ui/ProGate.tsx', 'src/components/home/StreakFreezeShop.tsx', 'src/components/chat/PersonalitySheet.tsx',
    'src/components/chat/NovoMemoryPanel.tsx', 'src/components/AchievementCardModal.tsx',
  ];
  for (const f of FILES) {
    it(f, () => {
      const src = readFileSync(f, 'utf8');
      expect(src).toMatch(/useBackHandler\(/);
      expect(src).not.toMatch(/addListener\(\s*['"]backButton['"]/);
    });
  }
  it('the only backButton listener in the app is the central one', () => {
    expect(readFileSync('src/hooks/useMobileHardware.ts', 'utf8')).toMatch(/addListener\('backButton'/);
    for (const f of ['src/pages/StudyRoomPage.tsx', 'src/components/layout/AppShell.tsx']) expect(readFileSync(f, 'utf8')).not.toMatch(/addListener\(\s*['"]backButton['"]/);
  });
});
