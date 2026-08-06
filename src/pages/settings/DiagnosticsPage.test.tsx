import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DiagnosticsPage from './DiagnosticsPage';

// Phase 3.3 (enterprise release-governance program): this page previously had
// zero test coverage. The specific behavior this file locks in is the new
// "Android version code" field added this phase — it must render on native
// platforms (sourced from @capacitor/app's getInfo().build) and must NOT
// render on web, since AppInfo.build has no meaningful value there and a
// stray "undefined" in a support-diagnostics screen would be worse than
// omitting the field.

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user-123' } }),
}));

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

function renderDiagnostics() {
  return render(
    <MemoryRouter>
      <DiagnosticsPage />
    </MemoryRouter>,
  );
}

describe('DiagnosticsPage', () => {
  it('renders core build fields on web (no native platform)', () => {
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false, getPlatform: () => 'web' },
    }));
    renderDiagnostics();
    expect(screen.getByText('App version')).toBeInTheDocument();
    expect(screen.getByText('Build commit')).toBeInTheDocument();
    expect(screen.getByText('Environment')).toBeInTheDocument();
  });

  it('does NOT render "Android version code" on web — no native AppInfo to source it from', () => {
    renderDiagnostics();
    expect(screen.queryByText('Android version code')).not.toBeInTheDocument();
  });

  it('renders "Android version code" from @capacitor/app.getInfo().build on native platforms', async () => {
    vi.resetModules();
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true, getPlatform: () => 'android' },
    }));
    vi.doMock('@capacitor/app', () => ({
      App: { getInfo: vi.fn().mockResolvedValue({ name: 'Edora', id: 'com.edora.app', build: '52', version: '4.0.0' }) },
    }));
    vi.doMock('@capacitor/device', () => ({
      Device: { getInfo: vi.fn().mockResolvedValue({ platform: 'android', osVersion: '14', model: 'Pixel 8' }) },
    }));
    vi.doMock('@capacitor/toast', () => ({ Toast: { show: vi.fn() } }));

    const { default: NativeDiagnosticsPage } = await import('./DiagnosticsPage');
    render(
      <MemoryRouter>
        <NativeDiagnosticsPage />
      </MemoryRouter>,
    );

    // Default waitFor timeout (1000ms) was observed to flake under full-suite
    // load (~1 in 6 runs) -- the component chains two dynamic import()s
    // (@capacitor/device, @capacitor/app) before setNativeApp fires, and CPU
    // contention across 12 concurrent test files occasionally pushes that
    // past 1s even though it's near-instant in isolation. Explicit timeout,
    // not a retry loop -- the assertion itself was never wrong.
    await waitFor(() => {
      expect(screen.getByText('Android version code')).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(screen.getByText('52')).toBeInTheDocument();

    vi.doUnmock('@capacitor/core');
    vi.doUnmock('@capacitor/app');
    vi.doUnmock('@capacitor/device');
    vi.doUnmock('@capacitor/toast');
  });
});
