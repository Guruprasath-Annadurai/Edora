import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

// Supabase query builders are thenables WITHOUT a .catch(): `await db.from(..).update(..).eq(..).catch(..)`
// throws TypeError before the query is sent. In this function that meant no native purchase, restore or
// RevenueCat webhook could ever set profiles.is_pro (verified 2026-09-25). The type checker reported 16 such
// sites; this test keeps them from coming back. Use `.then(logDbError(label))` or inspect `{ error }` instead.
Deno.test('novo-subscription has no .catch() chained on a Supabase query builder', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  const offenders: number[] = [];
  for (const m of src.matchAll(/\.catch\s*\(/g)) {
    const before = src.slice(0, m.index!);
    const stmtStart = Math.max(before.lastIndexOf(';'), before.lastIndexOf('\n\n'));
    const stmt = before.slice(stmtStart + 1);
    const isPromiseCatch = /\.(json|text)\(\)\s*$/.test(stmt.trim());
    if (/\.(from|rpc)\s*\(/.test(stmt) && !isPromiseCatch) offenders.push(before.split('\n').length);
  }
  assertEquals(offenders, []);
});
