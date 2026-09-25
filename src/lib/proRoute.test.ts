import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) out.push(p);
  }
  return out;
}

describe('/pro — every Pro gate must reach a functional purchase screen', () => {
  const app = read('src/App.tsx');

  it('mounts ProSubscriptionPage at /pro (not a redirect, not an unused alias)', () => {
    const line = app.split('\n').find(l => l.includes('<Route path="/pro"'))!;
    expect(line).toBeTruthy();
    expect(line).toContain('ProSubscriptionPage');
    expect(line).not.toMatch(/Navigate/);
    expect(app).not.toMatch(/const _ProSubscriptionPage/);
    expect(app).toMatch(/const ProSubscriptionPage\s*=\s*lazy\(/);
  });

  it('the ONLY files that navigate to /pro are the known gates (a new, untested gate must be added here on purpose)', () => {
    const known = new Set([
      'src/App.tsx',                                  // the route itself
      'src/components/ui/ProGate.tsx',                // ProGate card + sheet (Mock, PYQ, Analytics)
      'src/pages/ChatPage.tsx',                       // AI daily-limit banner + sheet
      'src/pages/AnalyticsDashboardPage.tsx',         // upgrade button
      'src/pages/MockTestPage.tsx',                   // upgrade link
      'src/lib/featureRegistry.ts',                   // command-palette entry
    ]);
    const found = new Set<string>();
    for (const f of walk(join(root, 'src'))) {
      if (/['"`]\/pro['"`?]/.test(readFileSync(f, 'utf8'))) found.add(f.replace(root + '/', ''));
    }
    expect([...found].sort()).toEqual([...known].sort());
  });

  it('nothing redirects /pro to /profile any more', () => {
    for (const f of walk(join(root, 'src'))) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/path="\/pro"[^\n]*Navigate to="\/profile"/);
    }
  });
});
