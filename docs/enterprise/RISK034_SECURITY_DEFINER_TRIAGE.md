# RISK-034 — SECURITY DEFINER Function/View Triage

Enterprise production-hardening pass, 2026-08-08. Full individual review of
every SECURITY DEFINER object flagged by the Supabase security advisor —
not sampled.

## The starting numbers were misleading

The risk register's original "165 findings / 7 ERROR / 156 WARN" figure was
captured against `edora-staging` immediately after its full 178-migration
replay (Gate 2). Re-running the same advisor against **production**
(`mlkzabspcwfockbmkmzl`, the actual enterprise-launch target) at the start
of this pass showed only **50 findings, 0 ERROR** — production had already
been incrementally hardened via changes applied directly to the database
and never captured in any committed migration file. This is the same
undocumented-production-drift pattern already named in RISK-029/033, found
again here:

- All 7 views already carried `security_invoker=on` in production (the 7
  ERROR-level findings) — confirmed via `pg_class.reloptions` — but no
  migration file ever set it.
- All 42 production functions already carried a pinned `search_path` —
  confirmed via `pg_proc.proconfig` — versus 37 flagged as mutable on
  staging.
- 5 of the 37 staging-flagged functions don't exist in production at all
  (staging-only, from migrations never actually deployed to prod).

Fixing staging to match production's real, already-hardened state — not
re-deciding search_path values from scratch — closed the bulk of the gap
between the two environments. `supabase/migrations/20260808010004_risk034_security_definer_triage.sql`
formally commits the view fix (idempotent on production, actually fixes it
on staging) so this stops being tribal knowledge.

## Real findings, fixed

**1. `buddy_checkin(p_pair_id)` — genuine authorization bypass.** Never
verified the caller was actually a party to the pair (`v_pair.user_id` or
`v_pair.buddy_id`). A malicious authenticated user could call
`buddy_checkin(<any pair id>)`, get their own `auth.uid()` recorded as a
checkin against a pair they're not in, and — if the real second party had
already checked in that day — trigger the "both studied" bonus-XP grant to
two uninvolved real users at will. Fixed by requiring `auth.uid()` to be
one of the pair's two members before doing anything else. Deployed and the
function definition verified live post-fix.

**2. `set_rag_cache`/`get_rag_cache` — cache-poisoning vector, wider than a
prior fix assumed.** A 2026-08-02 migration (`revoke_anon_rag_cache_write_access`)
revoked `anon`'s access reasoning "the app always calls these from an
authenticated session or a service-role edge function" — but a full-repo
grep this pass found the app **never** calls `set_rag_cache` from an
authenticated client session; only `gemini-chat`'s service-role client does.
`authenticated` access was still live, meaning any signed-in student could
write directly into the shared RAG response cache via
`/rest/v1/rpc/set_rag_cache`, poisoning AI-generated academic answers served
to other students who later hit the same cache key. Revoked `authenticated`
from both functions.

**3. `has_role` — cross-user role enumeration.** Callable by any
authenticated user with an arbitrary `_user_id`, letting anyone probe
whether a specific user is an admin/moderator via
`/rest/v1/rpc/has_role`. Confirmed via grep (only called from service-role
edge functions) and `pg_policies` (embedded in **zero** RLS policies) that
revoking `authenticated`'s direct access breaks nothing. Revoked.

**4. Unnecessary direct-call surface on 8 more functions.**
`check_memory_opt_out`/`increment_tournament_participants` are
`RETURNS trigger` functions confirmed (via `pg_trigger`) to run only via
their real attached triggers — direct RPC access was pure surface with no
functional use. `enforce_rate_limit`, `expand_weak_concepts`,
`search_ncert`, `search_ncert_fts`, `search_ncert_hybrid`,
`search_corpus_unified` are confirmed via full-repo grep to be called only
from service-role edge-function clients or internally from other SECURITY
DEFINER functions (which run as their own definer regardless of grants —
verified live post-revoke by calling `get_school_leaderboard`, which
internally calls `enforce_rate_limit`, with no permission error). All had
their `anon`/`authenticated` grants revoked.

**5. Leftover `PUBLIC` grants (caught by re-running the advisor mid-pass).**
Five functions (`check_memory_opt_out`, `expand_weak_concepts`,
`search_ncert_hybrid`, `submit_live_event_answers`,
`submit_live_event_score`) carried a separate, implicit
`GRANT EXECUTE TO PUBLIC` — the Postgres default for newly-created
functions — that a per-role `REVOKE FROM anon, authenticated` does **not**
remove, since `PUBLIC` is a pseudo-role every role inherits from unless
explicitly revoked. Only found because the advisor was re-run after each
fix instead of trusted blind; `submit_live_event_answers`/`_score` kept
their separate explicit `authenticated` grant so the real `LiveEventPage.tsx`
feature is unaffected.

## Findings reviewed and left as-is, with reasoning

- **`is_institution_admin`/`is_institution_member`/`is_in_study_group`** —
  callable by any authenticated user with an arbitrary `p_user_id`,
  enabling institution/study-group membership enumeration for other users.
  **Cannot be revoked**: confirmed via `pg_policies` that all three are
  embedded directly in RLS policies on `institutions`, `institution_members`,
  and `study_group_members` (`inst_read`, `inst_mem_insert`,
  `inst_mem_admin_update`, `inst_mem_admin_delete`, `inst_mem_own`,
  `sgm_read`). Revoking `authenticated`'s EXECUTE would break RLS
  evaluation — every query against those three tables by every authenticated
  user would fail with "permission denied for function." Accepted as a
  residual low-severity finding (exploitability requires already knowing
  target user IDs, and several other surfaces — leaderboards, friend lists,
  battle records — already leak user IDs).
- **28 remaining `authenticated`-callable functions** (accept_friend_request,
  add_streak_freeze, create_institution, get_school_leaderboard,
  increment_xp, upsert_topic_stat, etc.) — individually read in full. Every
  one either checks the caller's `auth.uid()` against the relevant
  user/party column before any write or sensitive read, or intentionally
  returns aggregate/non-PII/public-content data (get_chunk_citations reads
  public course content; get_school_leaderboard already has the RISK-019
  masking fix). These are the app's real, legitimate RPC surface — flagged
  by the advisor because SECURITY DEFINER is the correct pattern here (each
  needs to write across RLS-protected tables on the caller's behalf), not
  because access is unintentional.
- **`extension_in_public` (pg_net)** — pre-existing, Supabase-managed
  extension placement; not touched this pass.
- **`auth_leaked_password_protection`** — the underlying protection is
  already implemented via a custom HIBP check (Supabase's native toggle is
  Pro-tier only); the advisor flags the native toggle specifically, not the
  absence of the capability. No action needed, already resolved in an
  earlier session.

## Net result

| | Before (staging, stale baseline) | Production, start of this pass | Production, after |
|---|---|---|---|
| ERROR | 7 | 0 (already fixed, undocumented) | 0 |
| WARN | 157 | 50 | 28 |
| INFO | 2 | 0 | 0 |
| **Total** | **166** | **50** | **30** (28 WARN + 2 unrelated pre-existing) |

2 genuine live bugs closed (authorization bypass, cache poisoning). 9
functions had unnecessary grant surface removed. 7 views' hardening was
formally committed to version control for the first time. 1 residual
finding (institution/study-group membership enumeration) is accepted with
documented reasoning — fixing it would break real RLS-enforced functionality
for every authenticated user. `edora-staging` was brought back in line with
production, closing the environment drift this pass started by discovering.

**Status: VERIFIED COMPLETE for the objects reviewed.** This does not cover
every SECURITY DEFINER object across all 15 mandate phases' future work
(new functions added later need the same discipline) — it covers everything
flagged as of this pass, individually.
