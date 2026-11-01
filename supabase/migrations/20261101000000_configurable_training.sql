-- Migrace 5: konfigurovatelný trénink (PRD 4.6, 5.10, kap. 6). Dá se spustit opakovaně.
alter table public.trainings
  add column if not exists format text not null default 'classic',
  add column if not exists duration_min smallint,
  add column if not exists plan jsonb,
  add column if not exists locked_rounds jsonb;

do $$ begin
  alter table public.trainings add constraint trainings_format_check check (format in ('classic', 'custom'));
exception when duplicate_object then null; end $$;

-- Výsledek cvičení se může v jednom tréninku opakovat (víc kol téhož cvičení).
alter table public.solo_results add column if not exists round smallint not null default 0;
alter table public.solo_results drop constraint if exists solo_results_pkey;
alter table public.solo_results add primary key (training_id, player_id, metric, round);
