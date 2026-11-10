-- Migrace 25 (10. 11. 2026): nastavení tréninku se nepřepíše zastaralým stavem.
--
-- Uložení nastavení posílá celý řádek. Zařízení, které mezitím zmeškalo cizí změnu (telefon v kapse,
-- notebook u stolu), by ji svým uložením vrátilo zpět. Proto:
--  - trainings.version roste s každou změnou nastavení (ne se zamčením kol a týmů simulace – ta se
--    slučují sama a během tréninku je dělají hráči);
--  - save_training(řádek, očekávaná verze) uloží jen tehdy, když verze v databázi odpovídá té, ze které
--    úprava vycházela; jinak skončí chybou FL409 a appka ukáže aktuální stav. Bez očekávané verze
--    (nový trénink) ukládá vždy;
--  - zamčení kol jde vždy přes lock_rounds (jen prodloužení) – nově ho smí i organizátor, který nehraje.
-- Starší verze appky ukládá přímo do tabulky jako dřív; verzi jí zvedá trigger. Dá se spustit opakovaně.

alter table public.trainings add column if not exists version integer not null default 1;

create or replace function public.bump_training_version() returns trigger language plpgsql as $$
declare
  skip text[] := array['locked_rounds', 'sim_teams', 'updated_at', 'version'];
begin
  if (to_jsonb(new) - skip) is distinct from (to_jsonb(old) - skip) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end $$;

drop trigger if exists bump_training_version on public.trainings;
create trigger bump_training_version before update on public.trainings
  for each row execute function public.bump_training_version();

-- Běží s právy volajícího: kdo smí trénink založit / měnit, určují pravidla tabulky (RLS).
create or replace function public.save_training(p_row jsonb, p_expected int) returns public.trainings
language plpgsql set search_path = public as $$
declare
  r public.trainings := jsonb_populate_record(null::public.trainings, p_row);
  res public.trainings;
begin
  update public.trainings set
    date = r.date, start_time = coalesce(r.start_time, start_time), sim_split = coalesce(r.sim_split, sim_split),
    sim_teams = r.sim_teams, format = coalesce(r.format, format), duration_min = r.duration_min, plan = r.plan,
    locked_rounds = r.locked_rounds, breaks = r.breaks, discipline_min = r.discipline_min,
    discipline_order = r.discipline_order, created_by = r.created_by, mode = r.mode, tables = r.tables,
    attendees = coalesce(r.attendees, '{}'), notes = r.notes
  where id = r.id and (p_expected is null or version = p_expected)
  returning * into res;
  if found then return res; end if;

  if exists (select 1 from public.trainings where id = r.id) then
    if p_expected is not null and exists (select 1 from public.trainings where id = r.id and version <> p_expected) then
      raise exception 'Trénink mezitím změnil někdo jiný' using errcode = 'FL409';
    end if;
    raise exception 'Tento trénink nemůžeš měnit' using errcode = '42501';
  end if;

  -- Úprava tréninku, který mezitím někdo smazal, ho nesmí založit znovu.
  if p_expected is not null then
    raise exception 'Trénink už neexistuje' using errcode = '23503';
  end if;

  insert into public.trainings (id, date, start_time, sim_split, sim_teams, format, duration_min, plan, locked_rounds,
    breaks, discipline_min, discipline_order, created_by, mode, tables, attendees, notes)
  values (r.id, r.date, coalesce(r.start_time, '18:00'), coalesce(r.sim_split, 'performance'), r.sim_teams,
    coalesce(r.format, 'classic'), r.duration_min, r.plan, r.locked_rounds, r.breaks, r.discipline_min,
    r.discipline_order, r.created_by, r.mode, r.tables, coalesce(r.attendees, '{}'), r.notes)
  returning * into res;
  return res;
end $$;

-- Zamčení kol: i organizátor-zakladatel, který na tréninku nehraje (dřív ukládal celý řádek).
create or replace function public.lock_rounds(p_training uuid, p_locked jsonb, p_sim_teams jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  old jsonb;
  i int;
begin
  if not (public.is_admin() or public.is_creator(p_training) or public.is_attendee(p_training)) then
    raise exception 'Zamknout kola může jen hráč tréninku' using errcode = '42501';
  end if;
  select coalesce(locked_rounds, '[]'::jsonb) into old from public.trainings where id = p_training;
  if jsonb_array_length(p_locked) < jsonb_array_length(old) then
    raise exception 'Zamčená kola nejde zkrátit' using errcode = '22023';
  end if;
  for i in 0 .. jsonb_array_length(old) - 1 loop
    if (p_locked -> i) is distinct from (old -> i) then
      raise exception 'Zamčená kola nejde měnit' using errcode = '22023';
    end if;
  end loop;
  update public.trainings
     set locked_rounds = p_locked,
         sim_teams = coalesce(sim_teams, p_sim_teams)
   where id = p_training;
end $$;

grant execute on function public.save_training(jsonb, int), public.lock_rounds(uuid, jsonb, jsonb) to authenticated;
