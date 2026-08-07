# Offline Conflict Resolution

Phase 6 of the enterprise remediation mandate (RISK-009, High). Documents
the actual conflict/idempotency behavior of every offline-write path in the
app, and the real fix this phase made. Last verified 2026-08-07.

## The mechanism: `SyncQueue`

All offline writes go through one mechanism — `src/lib/syncQueue.ts`. A
user action while offline (or while a write silently fails) enqueues a
`SyncAction` to on-device storage (`@capacitor/preferences`, with a
`localStorage` fallback on web). `useOfflineSync.ts` flushes the queue
1.5s after the device reconnects (`Network.addListener('networkStatusChange')`),
and `offlineStudy.ts` also flushes opportunistically on app foreground.

There is no separate "conflict resolution" system for the client-authored
actions below — the queue itself, plus each action's chosen write shape
(insert vs. atomic RPC vs. upsert-on-conflict), **is** the conflict
strategy. What follows is what that strategy actually guarantees per
action type, not an aspirational design.

## The real bug this phase found and fixed

`SyncQueue.flush()` iterated the whole queue and only wrote the updated
queue back to disk **once, after the entire loop finished**. `flush()` runs
immediately after reconnecting — exactly when the network is most likely
to drop again mid-flush (a phone losing signal seconds after regaining it,
one bar on a train), and just as exposed to the OS backgrounding and
killing the app partway through a multi-entry queue on mid-range Android.

If either interrupted `flush()` after entry 1 of 2 had already written
successfully to Supabase, the on-disk queue still held **both** entries
(the save that would have dropped entry 1 never ran). The next flush
replayed entry 1 — which had already succeeded. For `xp_grant` specifically
this was compounded by the increment itself being a non-atomic
read-then-write (`select xp` → `update xp = old + amount`), so a replay
didn't just risk a duplicate row, it silently inflated XP.

This is the inverse of how RISK-009 was originally phrased ("progress
lost on flaky networks") — the queue's failure mode was actually
**progress duplicated**, which is arguably worse for XP (leaderboard/
fairness integrity) and definitely worse for anything analytics or
exam-prediction reads from (`quiz_sessions`, `topic_stats`).

**Fixed**: `flush()` now persists the queue after every entry, not once at
the end (`src/lib/syncQueue.ts`). An interruption at any point can now
only ever leave genuinely-unprocessed entries on disk. Also switched
`xp_grant` from the non-atomic read-then-write to `public.increment_xp` —
the same RPC every other XP-granting path in the app already uses (see
`20260804193659_fix_increment_xp_missing_auth_check.sql`) — which does the
increment in one atomic statement and, as a bonus correctness fix, also
recalculates `profiles.level` from the new xp, which the old client-side
code never did at all. Verified with `src/lib/syncQueue.test.ts`: a
simulated failure on the second of two queued entries leaves exactly one
entry on disk (the failed one), not both.

## Per-action-type conflict rules (as they exist today)

| Action | Write shape | Idempotent against queue replay? | Notes |
|---|---|---|---|
| `xp_grant` | `rpc('increment_xp', ...)` (atomic) + `xp_history` insert | **Structurally, via the fix above** — no longer reachable twice from the same queue entry. Not idempotent at the RPC level itself (calling it twice legitimately adds XP twice) — safety comes from the queue never re-presenting an already-succeeded entry, not from the RPC being naturally idempotent. | Capped at 500 XP/action client-side; `user_id` must match the live session or the entry is dropped without a network call (prevents a stale/manipulated queue entry crediting the wrong or an arbitrary account). |
| `streak_tick` | `upsert(..., { onConflict: 'user_id,date' })` | **Yes, naturally.** Replaying the same entry twice is a no-op. | Best conflict shape in the queue — a model for what the others below should eventually move to if they need direct idempotency rather than relying solely on the queue fix. |
| `lesson_complete` | `upsert(..., { onConflict: 'user_id,lesson_id' })` | **Yes, naturally.** | Same as above. |
| `quiz_answer` | plain `insert` | No independent dedup key — relies entirely on the queue-persistence fix above to avoid a double-insert. | A genuine duplicate (not a replay — e.g. the same question answered twice in different offline sessions) is intentionally allowed; this table is an append-only answer log, not a current-state table. |
| `quiz_session` | plain `insert`, guarded by `user_id === session.user.id` | Same as `quiz_answer` — relies on the queue fix. | Feeds `exam-prediction`/analytics; a queue-replay duplicate here would double-count a session's contribution to those, which is the concrete harm this phase's fix closes. |
| `topic_perf` | `rpc('upsert_topic_performance', ...)` | Depends on that RPC's own internal logic (not re-audited this phase — it long predates this mandate). Relies on the queue fix for the replay case. | Out of scope for this phase's code changes; flagged here rather than silently assumed safe. |
| `flashcard_review` | `functions.invoke('novo-insights', { action: 'update_sr', ... })` | Not verified this phase — spaced-repetition ease-factor updates are typically NOT naturally idempotent (replaying "quality=4" twice would double-adjust the interval). Relies on the queue fix to avoid the replay in the first place. | Edge function internals out of scope for this phase; the queue-level fix is what actually protects this action today. |

**Cross-device conflicts** (the same account logged in on two devices,
both syncing near-simultaneously) are only genuinely conflict-free for
`streak_tick` and `lesson_complete` (their `upsert` shape is commutative
regardless of arrival order). `xp_grant` is safe against this specifically
*because* `increment_xp` is atomic at the database level — two concurrent
increments from two devices both land correctly, in whichever order
Postgres serializes them, unlike the old read-then-write which could lose
one device's increment entirely. `quiz_answer`/`quiz_session`/`topic_perf`/
`flashcard_review` have no special two-device handling; two devices
producing genuinely different offline sessions is expected and desired
(each is real, distinct work), but two devices somehow queuing the *same*
logical action would double-write, same as the single-device replay case,
minus the protection the queue-persistence fix gives within one device's
own queue.

## Read-side caches (not a conflict scenario)

`src/lib/offlineCache.ts` / `offlineStudy.ts`'s prefetch (NCERT chapters,
roadmap, flashcard decks, PYQ pool) are one-way mirrors of server data for
offline reading — there is no client-authored write to conflict with a
server write here. The only relevant property is staleness, governed by
`PREFETCH_INTERVAL_MS` (6h) in `offlineStudy.ts`: cached content is served
as-is until the next scheduled refresh: last-fetch-wins by construction,
which is the correct and sufficient policy for read-only mirrored content.

## What remains open

- `topic_perf`'s RPC and `flashcard_review`'s edge-function SR update were
  not independently audited for idempotency this phase — the queue-level
  fix protects them from the *replay* failure mode this phase found, but a
  dedicated idempotency key at the RPC/function level (matching the
  `streak_tick`/`lesson_complete` upsert pattern) would be a stronger,
  more independent guarantee. Not done — flagged honestly rather than
  assumed.
- No offline-to-online E2E test exists yet that forces a real interrupted
  flush against a live (staging) backend and asserts no duplication — the
  new `src/lib/syncQueue.test.ts` unit tests verify the queue-persistence
  logic in isolation with mocked Supabase calls, which is real coverage
  but not the same as an end-to-end network-interruption test.
