import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { pickActiveEntitlement } from './rcEntitlement.ts';

Deno.test('pickActiveEntitlement returns null when no pro entitlement exists', () => {
  const body = { subscriber: { entitlements: { active: {} } } };
  assertEquals(pickActiveEntitlement(body), null);
});

Deno.test('pickActiveEntitlement returns null for missing subscriber object', () => {
  assertEquals(pickActiveEntitlement({}), null);
});

Deno.test('pickActiveEntitlement returns entitlement for lifetime (null expires_date)', () => {
  const entitlement = { expires_date: null, product_identifier: 'pro_lifetime', store: 'play_store' };
  const body = { subscriber: { entitlements: { active: { pro: entitlement } } } };
  assertEquals(pickActiveEntitlement(body), entitlement);
});

Deno.test('pickActiveEntitlement returns entitlement when expires_date is in the future', () => {
  const entitlement = { expires_date: '2099-01-01T00:00:00Z', product_identifier: 'pro_annual', store: 'play_store' };
  const body = { subscriber: { entitlements: { active: { pro: entitlement } } } };
  assertEquals(pickActiveEntitlement(body, new Date('2026-01-01')), entitlement);
});

Deno.test('pickActiveEntitlement rejects an expired entitlement (security-critical)', () => {
  const entitlement = { expires_date: '2020-01-01T00:00:00Z', product_identifier: 'pro_monthly', store: 'play_store' };
  const body = { subscriber: { entitlements: { active: { pro: entitlement } } } };
  assertEquals(pickActiveEntitlement(body, new Date('2026-01-01')), null);
});

Deno.test('pickActiveEntitlement rejects entitlement expiring exactly now', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const entitlement = { expires_date: now.toISOString(), product_identifier: 'pro_monthly', store: 'play_store' };
  const body = { subscriber: { entitlements: { active: { pro: entitlement } } } };
  assertEquals(pickActiveEntitlement(body, now), null);
});

Deno.test('pickActiveEntitlement ignores non-pro entitlements', () => {
  const body = { subscriber: { entitlements: { active: { trial: { expires_date: null } } } } };
  assertEquals(pickActiveEntitlement(body), null);
});
