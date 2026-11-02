-- Trénink na 1 stůl: počet stolů 1–4 (dřív 2–4).
alter table public.trainings drop constraint if exists trainings_tables_check;
alter table public.trainings add constraint trainings_tables_check check (tables between 1 and 4);
