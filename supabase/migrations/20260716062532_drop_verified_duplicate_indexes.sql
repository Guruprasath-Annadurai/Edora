-- Drops 13 provably-redundant duplicate indexes (same table, same columns,
-- same order, no partial predicate — verified via pg_indexes definitions,
-- not usage stats). Each dropped index has a sibling UNIQUE constraint index
-- covering the identical column set, so the query planner behaves identically
-- and no functionality changes. Constraint-backed indexes are left untouched.
--
-- Explicitly NOT included: index pairs that differ in sort order (DESC) or
-- carry a partial WHERE clause (e.g. novo_proactive_messages' unread-only
-- index) — those serve distinct query patterns despite matching column lists.
drop index if exists public.idx_exam_predictions_user;
drop index if exists public.idx_institutions_join_code;
drop index if exists public.knowledge_graph_slug_idx;
drop index if exists public.idx_learning_style_profiles_user;
drop index if exists public.lpt_plan_day_idx;
drop index if exists public.cert_share_code_idx;
drop index if exists public.profiles_username_idx;
drop index if exists public.idx_qexp_hash;
drop index if exists public.rag_cache_key_idx;
drop index if exists public.scd_challenge_idx;
drop index if exists public.sg_invite_idx;
drop index if exists public.study_rooms_code_idx;
drop index if exists public.user_topic_progress_user_topic_idx;
