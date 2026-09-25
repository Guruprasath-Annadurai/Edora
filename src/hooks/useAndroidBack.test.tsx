import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const cap = vi.hoisted(() => ({ listener: null as null | ((e: { canGoBack: boolean }) => void), minimize: vi.fn(), platform: 'android' }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => cap.platform, isNativePlatform: () => cap.platform !== 'web' } }));
vi.mock('@capacitor/network', () => ({ Network: { getStatus: vi.fn(), addListener: vi.fn() } }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (_: string, cb: (e: { canGoBack: boolean }) => void) => { cap.listener = cb; return Promise.resolve({ remove: vi.fn() }); },
    minimizeApp: () => cap.minimize(),
  },
}));
const nav = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')), useNavigate: () => nav }));

import { useAndroidBack } from '@/hooks/useMobileHardware';
import { useBackHandler } from '@/hooks/useBackStack';
import { resetBackStack } from '@/lib/backStack';

function Harness({ overlay = false }: { overlay?: boolean }) {
  useAndroidBack();
  useBackHandler(overlay, () => true, 80);
  return null;
}
const mount = (path: string, overlay = false) => render(<MemoryRouter initialEntries={[path]}><Harness overlay={overlay} /></MemoryRouter>);
const press = (canGoBack = true) => cap.listener!({ canGoBack });

beforeEach(() => { cap.listener = null; cap.minimize.mockReset(); nav.mockReset(); cap.platform = 'android'; resetBackStack(); });

describe('useAndroidBack (single app-wide listener)', () => {
  it('an open modal/sheet consumes Back first — no navigation, no exit', () => {
    mount('/practice', true);
    press();
    expect(nav).not.toHaveBeenCalled();
    expect(cap.minimize).not.toHaveBeenCalled();
  });
  it('from Home Back minimises the app (normal Android exit)', () => {
    mount('/home'); press();
    expect(cap.minimize).toHaveBeenCalledTimes(1);
    expect(nav).not.toHaveBeenCalled();
  });
  it('from another primary tab Back returns to Home (replace) instead of a legacy/blank route', () => {
    for (const p of ['/chat', '/practice', '/progress', '/profile']) {
      nav.mockReset(); cap.listener = null; mount(p); press();
      expect(nav).toHaveBeenCalledWith('/home', { replace: true });
    }
  });
  it('from a nested route Back goes to the previous screen when there is history', () => {
    window.history.replaceState({ idx: 2 }, '');
    mount('/quiz'); press(true);
    expect(nav).toHaveBeenCalledWith(-1);
  });
  it('from a nested route with NO history Back goes Home (never a dead end)', () => {
    mount('/weakness-radar'); press(false);
    expect(nav).toHaveBeenCalledWith('/home', { replace: true });
  });
  it('only ONE listener is registered (no competing listeners)', () => {
    mount('/home');
    expect(cap.listener).not.toBeNull();
  });
  it('is inert off Android (web/iOS)', () => {
    cap.platform = 'web'; mount('/home');
    expect(cap.listener).toBeNull();
  });
});
