-- §14 (docs/enterprise-remediation-tracker.md): "does deletion actually
-- remove data from every listed system" was previously untested. It wasn't
-- fully true: 3 foreign keys would either silently fail deletion (NO ACTION)
-- or actively block it (RESTRICT), rather than the SET NULL pattern already
-- used consistently everywhere else a historical record needs to survive
-- without the deleted user's identity attached (school_licenses.admin_user_id,
-- doubt_room_answers.user_id, live_room_messages.user_id).
--
-- Verified live before fixing: 1 real institution currently has
-- admin_user_id set — that institution's admin is right now unable to
-- delete their account at all under the old RESTRICT rule.

alter table public.battles
  drop constraint battles_winner_id_fkey,
  add constraint battles_winner_id_fkey
    foreign key (winner_id) references public.profiles(id) on delete set null;

alter table public.live_events
  drop constraint live_events_winner_id_fkey,
  add constraint live_events_winner_id_fkey
    foreign key (winner_id) references public.profiles(id) on delete set null;

alter table public.institutions
  drop constraint institutions_admin_user_id_fkey,
  add constraint institutions_admin_user_id_fkey
    foreign key (admin_user_id) references public.profiles(id) on delete set null;
