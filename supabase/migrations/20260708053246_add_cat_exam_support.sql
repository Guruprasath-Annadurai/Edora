alter table public.pyq_content drop constraint pyq_content_exam_check;
alter table public.pyq_content add constraint pyq_content_exam_check
  check (exam = any (array['JEE_MAIN','JEE_ADV','NEET','BITSAT','BOARDS','CAT']));
