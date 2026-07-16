alter table mains_questions
  add column exam text not null default 'UPSC',
  add column class_level text null;

alter table mains_questions
  add constraint mains_questions_exam_check check (exam in ('UPSC', 'CBSE'));

alter table mains_questions drop constraint mains_questions_paper_check;
alter table mains_questions add constraint mains_questions_paper_check
  check (paper = ANY (ARRAY['Essay','GS1','GS2','GS3','GS4','Science','Social Science','Physics','Biology','Maths']::text[]));

alter table mains_answer_submissions
  add column if not exists exam text null;

-- backfill existing UPSC rows' submissions with exam for reporting/admin filter convenience
update mains_answer_submissions s
set exam = q.exam
from mains_questions q
where s.question_id = q.id and s.exam is null;
