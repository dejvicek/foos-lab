-- Migrace 14: průběh hry (PRD 4.9) – každé ťuknutí jako událost s časem. Dá se spustit opakovaně.
-- Seznam se jen doplňuje; „Zpět“ = stejná událost s delta −1. ID generuje zařízení (opakovaný zápis je bez účinku).
-- item_id: ID zápasu, u cvičení drill|kolo|stůl|hráči → práva zápisu jako u skóre (can_write_score).

create table if not exists public.game_events (
  id text primary key,
  training_id uuid not null references public.trainings (id) on delete cascade,
  item_id text not null,
  at timestamptz not null default now(),
  kind text not null check (kind in ('goal', 'loss', 'hit', 'miss')),
  side text check (side in ('A', 'B')),
  player_id uuid,
  delta smallint not null check (delta in (-1, 1))
);
create index if not exists game_events_training on public.game_events (training_id, at);
alter table public.game_events enable row level security;

drop policy if exists "read" on public.game_events;
drop policy if exists "insert" on public.game_events;
create policy "read" on public.game_events for select to authenticated using (public.current_player() is not null);
create policy "insert" on public.game_events for insert to authenticated with check (public.can_write_score(training_id, item_id));

do $$ begin
  alter publication supabase_realtime add table public.game_events;
exception when duplicate_object then null; end $$;
