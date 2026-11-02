-- Migrace 12: Zdržovači – zahájení a konec utkání (PRD 4.8). Dá se spustit opakovaně.
-- item_id: ID zápasu (league|… / sim|…), u cvičení drill|kolo|stůl|hráči. Hráči jsou v ID,
-- takže práva zápisu jsou stejná jako u skóre: účastník utkání, rozhodčí, zakladatel, admin.

create table if not exists public.play_times (
  training_id uuid not null references public.trainings (id) on delete cascade,
  item_id text not null,
  started_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (training_id, item_id)
);
alter table public.play_times enable row level security;

drop policy if exists "read" on public.play_times;
drop policy if exists "write" on public.play_times;
create policy "read" on public.play_times for select to authenticated using (public.current_player() is not null);
create policy "write" on public.play_times for all to authenticated
  using (public.can_write_score(training_id, item_id)) with check (public.can_write_score(training_id, item_id));

do $$ begin
  alter publication supabase_realtime add table public.play_times;
exception when duplicate_object then null; end $$;
