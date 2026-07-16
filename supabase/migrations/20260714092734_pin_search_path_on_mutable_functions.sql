
alter function public.calc_mock_percentile(numeric,text) set search_path = public;
alter function public.cleanup_push_log() set search_path = public;
alter function public.cleanup_rank_snapshots() set search_path = public;
alter function public.create_institution(text,text,text,text) set search_path = public;
alter function public.generate_referral_code() set search_path = public;
alter function public.get_ab_variant(uuid,text) set search_path = public;
alter function public.get_institution_weak_topics(uuid) set search_path = public;
alter function public.join_institution(text) set search_path = public;
alter function public.process_referral(uuid,text) set search_path = public;
alter function public.snapshot_leaderboard_ranks() set search_path = public;
alter function public.sync_institution_student_count() set search_path = public;
