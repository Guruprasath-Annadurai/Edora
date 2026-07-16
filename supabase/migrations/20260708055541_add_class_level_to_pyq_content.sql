-- Board exams (CBSE_10/CBSE_12) both map to exam='BOARDS' with no grade
-- distinction — a real pre-existing gap: 'Maths' subject exists at both
-- Class 10 and Class 12 with no way to tell them apart. Fixing before
-- seeding board content, not after.
alter table public.pyq_content add column if not exists class_level text;
