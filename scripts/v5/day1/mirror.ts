// Test-only helpers for the Day-1 local mirror (Postgres + PostgREST in Docker).
// Not shipped with the app. Nothing here can reach production: every URL is localhost.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const REST_BASE = 'http://localhost:54330';
const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

function b64url(b: Buffer | string) {
  return Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
export function mintJwt(sub: string, role = 'authenticated'): string {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify({ sub, role, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }));
  const s = b64url(createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}

/** supabase-js appends /rest/v1; PostgREST serves at the root, so rewrite. */
export function rewriteFetch(failNext?: { n: number }): typeof fetch {
  return async (input, init) => {
    if (failNext && failNext.n > 0) { failNext.n--; throw new TypeError('fetch failed (simulated network drop)'); }
    const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
    return fetch(url.replace('http://mirror.local/rest/v1', REST_BASE), init);
  };
}

export function clientFor(userId: string, failNext?: { n: number }): SupabaseClient {
  const jwt = mintJwt(userId);
  const c = createClient('http://mirror.local', jwt, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: rewriteFetch(failNext) },
  });
  // The queue reads a session before flushing; supply one for the test user.
  (c.auth as unknown as { getSession: () => Promise<unknown> }).getSession = async () => ({
    data: { session: { access_token: jwt, user: { id: userId } } }, error: null,
  });
  return c;
}

export function sql(q: string): string {
  return execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=pw', 'd1-pg', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-Atq', '-c', q], { encoding: 'utf8' }).trim();
}
export function resetDb(withScorePct: boolean) {
  sql('truncate public.quiz_sessions, public.topic_performance, public.profiles cascade');
  sql('alter table public.quiz_sessions drop column if exists score_pct');
  if (withScorePct) sql('alter table public.quiz_sessions add column score_pct numeric');
  reloadSchemaCache();
}
/** Hosted Supabase reloads PostgREST's schema cache on DDL via an event trigger; the mirror does it explicitly. */
export function reloadSchemaCache() {
  sql("notify pgrst, 'reload schema'");
  execFileSync('sleep', ['1.5']);
}
export function seedUser(xp = 0): string {
  const id = randomUUID();
  sql(`insert into public.profiles(id, full_name, xp) values ('${id}','Test ${id.slice(0, 4)}', ${xp})`);
  return id;
}
export const dbCount = (uid: string) => Number(sql(`select count(*) from public.quiz_sessions where user_id='${uid}'`));
export const dbXp = (uid: string) => Number(sql(`select xp from public.profiles where id='${uid}'`));
export const dbTopicTotal = (uid: string) => Number(sql(`select coalesce(sum(total_q),0) from public.topic_performance where user_id='${uid}'`));

export const QUESTIONS = Array.from({ length: 5 }, (_, i) => ({
  question: `Q${i + 1}?`, options: ['A', 'B', 'C', 'D'], correct_answer: 0, explanation: 'x',
}));
