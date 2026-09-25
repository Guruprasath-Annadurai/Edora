import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PRO_MONTHLY_INR, PRO_ANNUAL_INR, PRO_PRICE_SHORT, PRO_PRICE_LINE, ANNUAL_PLAN_SUBLABEL, ANNUAL_SAVINGS_PCT, ANNUAL_EQUIVALENT_PER_MONTH_INR } from '@/lib/proPricing';
import { IAP } from '@/lib/iap';

function walk(d: string): string[] {
  return readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(n) ? [p] : []; });
}

describe('Pro price copy matches plan truth (₹99/month, ₹699/year)', () => {
  it('constants equal the store product prices and the server plan amounts', () => {
    expect(IAP.products.pro_monthly.price).toBe(`₹${PRO_MONTHLY_INR}/month`);
    expect(IAP.products.pro_annual.price).toBe(`₹${PRO_ANNUAL_INR}/year`);
    expect(IAP.products.pro_annual.price_inr).toBe(PRO_ANNUAL_INR * 100);
    const server = readFileSync('supabase/functions/novo-subscription/index.ts', 'utf8');
    expect(server).toMatch(new RegExp(`monthly:\\s*\\{\\s*amount_paise:\\s*${PRO_MONTHLY_INR * 100}`));
    expect(server).toMatch(new RegExp(`annual:\\s*\\{\\s*amount_paise:\\s*${PRO_ANNUAL_INR * 100}`));
  });

  it('upgrade footer states both real prices', () => {
    expect(PRO_PRICE_SHORT).toBe('₹99/month or ₹699/year');
    expect(PRO_PRICE_LINE).toBe('₹99/month or ₹699/year · Cancel anytime');
  });

  it('the annual equivalent is explicitly labelled as an annual-plan figure, never as the monthly price', () => {
    expect(ANNUAL_EQUIVALENT_PER_MONTH_INR).toBe(58);
    expect(ANNUAL_PLAN_SUBLABEL).toMatch(/per year/);
    expect(ANNUAL_PLAN_SUBLABEL).toMatch(/annual plan/);
    expect(ANNUAL_SAVINGS_PCT).toBe(41);
  });

  it('no screen says "From ₹58/month" (the stale, misleading monthly price) any more', () => {
    for (const f of walk('src')) {
      if (f.endsWith('proPricing.test.ts')) continue;
      const src = readFileSync(f, 'utf8');
      expect(/From\s+₹\s?58\s*\/\s*month/i.test(src), f).toBe(false);
    }
  });

  it('every visible "₹58" appears only inside the labelled annual-plan copy', () => {
    for (const f of walk('src')) {
      if (/\.test\./.test(f) || f.endsWith('proPricing.ts')) continue;
      expect(/₹\s?58\b/.test(readFileSync(f, 'utf8')), f).toBe(false);
    }
  });
});
