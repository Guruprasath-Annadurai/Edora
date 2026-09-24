-- Phase 12 (content governance): pyq_content's SELECT policy previously had
-- qual = true, meaning is_active/is_reviewed/flagged_for_review existed as
-- columns but were never actually enforced by RLS -- any row was readable
-- regardless of these flags. Confirmed via app-code audit that no client
-- query anywhere filters on is_active either, so this was the only real
-- enforcement point. Verified safe before applying: 0 of 555 rows are
-- currently is_active=false, so this is a zero-behavior-change-today fix
-- that closes a real gap for future deactivations.
--
-- Deliberately NOT also gating on is_reviewed here: 233/555 rows (all of
-- CAT, BOARDS, and UPSC content) are is_reviewed=false, and gating on it
-- would drop those three exams to zero questions instantly. That decision
-- needs the founder, not this migration -- see RISK-032.
drop policy if exists pyq_public_read on public.pyq_content;
create policy pyq_public_read on public.pyq_content for select using (is_active = true);
