import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({ aiOn: true }));
vi.mock('@/hooks/useAppFlags', () => ({ useAppFlag: (n: string) => (n === 'ai_generation_enabled' ? state.aiOn : true), useAppFlags: () => ({}) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => stableAuth }));
const stableAuth = vi.hoisted(() => ({ profile: { id: 'u1', is_pro: false } }));

const geminiJSON = vi.hoisted(() => vi.fn());
vi.mock('@/lib/gemini', () => ({ geminiJSON: (...a: unknown[]) => geminiJSON(...a) }));
const invoke = vi.hoisted(() => vi.fn());
const insert = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: () => ({ insert: (...a: unknown[]) => { insert(...a); return { select: async () => ({ data: [{ id: 'c1' }], error: null }) }; } }),
  },
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/achievements', () => ({ loadUnlockedIds: vi.fn().mockResolvedValue([]), checkFlashcardCountAchievements: vi.fn() }));
vi.mock('@/hooks/useHaptic', () => ({ useHaptic: () => ({ light: vi.fn(), medium: vi.fn(), success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/offlineCache', () => ({ OfflineCache: { get: vi.fn(), set: vi.fn() } }));
vi.mock('@/lib/userContentIndex', () => ({ indexUserItem: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));
vi.mock('@/components/ui/ReportButton', () => ({ ReportButton: () => null }));
vi.mock('@/lib/dailyMission', () => ({ markMissionTaskComplete: vi.fn() }));

import FlashcardPage from '@/pages/FlashcardPage';

async function openCreateAndType() {
  render(<FlashcardPage />);
  fireEvent.change(await screen.findByPlaceholderText(/Topic/i), { target: { value: 'Photosynthesis' } });
}

beforeEach(() => { geminiJSON.mockReset(); invoke.mockReset(); insert.mockReset(); });

describe('FlashcardPage "Generate with AI" honours ai_generation_enabled', () => {
  it('false: button disabled, calm paused message shown, and NO generation request is made', async () => {
    state.aiOn = false;
    await openCreateAndType();
    const btn = screen.getByRole('button', { name: /Generate 5 Cards/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/AI generation is temporarily paused\. Your saved practice and review still work\./);
    fireEvent.click(btn);
    expect(geminiJSON).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('false: manual (non-AI) card creation is still available', async () => {
    state.aiOn = false;
    await openCreateAndType();
    fireEvent.click(screen.getByRole('button', { name: /Create Card/i }));   // manual creation is unaffected
    expect(await screen.findByRole('button', { name: /Save/i })).toBeTruthy();
  });

  it('true: generation runs normally', async () => {
    state.aiOn = true;
    geminiJSON.mockResolvedValue([{ front: 'Q', back: 'A' }]);
    await openCreateAndType();
    const btn = screen.getByRole('button', { name: /Generate 5 Cards/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(geminiJSON).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
