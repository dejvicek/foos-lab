-- Migrace 23 (10. 11. 2026): data jedním dotazem a dorovnání jen o změny.
--
-- changes_since(null)  → všechna data (hráči, tréninky, skóre, výsledky cvičení, časy utkání, katalog)
--                        v jedné odpovědi místo šesti dotazů; průběh her (game_events) se čte zvlášť po trénincích.
-- changes_since(kurzor) → jen řádky změněné od minula a seznam smazaných. Kurzor je čas serveru z minulé
--                        odpovědi; hledá se s 30s přesahem (zápis mohl být v tu chvíli rozpracovaný).
--                        Kurzor starší než 60 dní dostane kompletní data.
--
-- Aby šlo změny poznat: každá tabulka má updated_at nastavované serverem (ne hodinami telefonu)
-- a smazané řádky se zapisují do deleted_rows (drží se 90 dní).
-- Starší verze appky nic z toho nepoužívá a funguje dál. Dá se spustit opakovaně.

alter table public.players add column if not exists updated_at timestamptz not null default now();
alter table public.trainings add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table if not exists public.deleted_rows (
  id bigint generated always as identity primary key,
  tbl text not null,
  key jsonb not null,
  deleted_at timestamptz not null default now()
);
create index if not exists deleted_rows_at on public.deleted_rows (deleted_at);
alter table public.deleted_rows enable row level security;
drop policy if exists "read" on public.deleted_rows;
create policy "read" on public.deleted_rows for select to authenticated using ((select public.current_player()) is not null);

-- Zapíše klíč smazaného řádku (sloupce klíče jsou argumenty triggeru).
create or replace function public.log_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := to_jsonb(old);
  k jsonb := '{}'::jsonb;
  i int;
begin
  for i in 0 .. tg_nargs - 1 loop
    k := k || jsonb_build_object(tg_argv[i], o -> tg_argv[i]);
  end loop;
  insert into public.deleted_rows (tbl, key) values (tg_table_name, k);
  -- Starší záznamy už nikdo nepotřebuje: starý kurzor dostane kompletní data.
  delete from public.deleted_rows where deleted_at < now() - interval '90 days';
  return old;
end $$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['players', 'trainings', 'scores', 'solo_results', 'play_times', 'catalog'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', tbl);
    execute format(
      'create trigger touch_updated_at before insert or update on public.%I for each row execute function public.touch_updated_at()', tbl);
  end loop;
end $$;

drop trigger if exists log_deleted on public.players;
create trigger log_deleted after delete on public.players for each row execute function public.log_deleted('id');
drop trigger if exists log_deleted on public.trainings;
create trigger log_deleted after delete on public.trainings for each row execute function public.log_deleted('id');
drop trigger if exists log_deleted on public.scores;
create trigger log_deleted after delete on public.scores for each row execute function public.log_deleted('training_id', 'match_id');
drop trigger if exists log_deleted on public.solo_results;
create trigger log_deleted after delete on public.solo_results for each row
  execute function public.log_deleted('training_id', 'player_id', 'metric', 'round');
drop trigger if exists log_deleted on public.play_times;
create trigger log_deleted after delete on public.play_times for each row execute function public.log_deleted('training_id', 'item_id');

-- Běží s právy volajícího: pravidla čtení (RLS) platí jako u běžných dotazů.
create or replace function public.changes_since(p_since timestamptz) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  full_load boolean := p_since is null or p_since < now() - interval '60 days';
  since timestamptz := p_since - interval '30 seconds';
begin
  return jsonb_build_object(
    'full', full_load,
    'cursor', now(),
    'players', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.players x where full_load or x.updated_at > since),
    'trainings', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.trainings x where full_load or x.updated_at > since),
    'scores', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.scores x where full_load or x.updated_at > since),
    'solo_results', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.solo_results x where full_load or x.updated_at > since),
    'play_times', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.play_times x where full_load or x.updated_at > since),
    'catalog', (select x.data from public.catalog x where x.id = 1 and (full_load or x.updated_at > since)),
    'deleted', (
      select coalesce(jsonb_agg(jsonb_build_object('tbl', x.tbl, 'key', x.key) order by x.id), '[]'::jsonb)
        from public.deleted_rows x where not full_load and x.deleted_at > since)
  );
end $$;

grant execute on function public.changes_since(timestamptz) to authenticated;
