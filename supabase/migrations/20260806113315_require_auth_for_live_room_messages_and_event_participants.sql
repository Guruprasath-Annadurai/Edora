-- Phase 1.2 security fix, found during the RLS matrix review: live_room_messages
-- and live_event_participants both had SELECT policies of `USING (true)` for
-- the `public` role, with no auth.uid() check at all. Since Postgres 'public'
-- includes anon, this meant real chat message content (including sender_name)
-- and live-event participant scores were readable by anyone on the internet,
-- no login required.
--
-- Fix: require authentication, matching the exact pattern already used by
-- this codebase's own study_room_members SELECT policy
-- ("Authenticated users read members": auth.uid() IS NOT NULL). This closes
-- the unauthenticated-scraping vector while preserving all existing in-app
-- authenticated behavior unchanged (the app already requires login to reach
-- these screens).
--
-- Deliberately NOT tightened further to room-membership-only in this pass —
-- that would be a larger, riskier behavior change requiring product
-- confirmation of whether non-members are meant to preview room content.
-- Filed as a follow-up (see docs/security/RLS_MATRIX.md).

drop policy if exists "live_messages_read_all" on public.live_room_messages;
create policy "live_messages_read_authenticated"
  on public.live_room_messages
  for select
  to public
  using ((select auth.uid()) is not null);

drop policy if exists "lep_read_all" on public.live_event_participants;
create policy "lep_read_authenticated"
  on public.live_event_participants
  for select
  to public
  using ((select auth.uid()) is not null);
