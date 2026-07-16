-- Human/AI review pipeline for pyq_content. Existing content is grandfathered
-- as reviewed (default true) so nothing already live breaks. The 73 rows I
-- hand-authored this session for CAT/UPSC/BOARDS (year=2026 marker) are the
-- ones nobody but me fact-checked — queued for a real AI second-opinion pass.
alter table public.pyq_content add column if not exists is_reviewed boolean not null default true;
alter table public.pyq_content add column if not exists flagged_for_review boolean not null default false;
alter table public.pyq_content add column if not exists review_notes text;
alter table public.pyq_content add column if not exists reviewed_by text;
alter table public.pyq_content add column if not exists is_active boolean not null default true;

update public.pyq_content
set is_reviewed = false
where exam in ('CAT', 'UPSC', 'BOARDS') and year = 2026;
