-- Migrace 28 (12. 11. 2026): BO formát zápasů (BO1, BO2, BO3, BO5, BO X).
--  - trainings.match_formats: formát zápasových disciplín tréninku (počet legů, gólů na leg, rozhodující leg
--    o 2 se stropem); null = BO1 do 6. Ukládá se přes save_training s ostatním nastavením.
--  - Skóre dalších legů má ID zápasu s příponou `#n` (leg 1 beze změny). Rozhodčí zápasu smí zapisovat
--    i do jeho dalších legů – can_write_score porovnává ID zápasu bez přípony.
-- Starší verze appky formát nezná (uložení tréninku by ho smazalo) → COMPAT 3. Dá se spustit opakovaně.

alter table public.trainings add column if not exists match_formats jsonb;

create or replace function public.can_write_score(p_training uuid, p_match text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_creator(p_training) or public.is_practice_player(p_training) or (
    public.is_attendee(p_training) and (
      position(public.current_player()::text in p_match) > 0
      or exists (
        select 1 from public.trainings t,
          jsonb_array_elements(coalesce(t.locked_rounds, '[]'::jsonb)) lr,
          jsonb_array_elements(lr -> 'rows') r,
          jsonb_array_elements(r -> 'cells') c
         where t.id = p_training and c ->> 'type' = 'match'
           and c -> 'match' ->> 'id' = regexp_replace(p_match, '#[0-9]+$', '')
           and c -> 'match' ->> 'referee' = public.current_player()::text)))
$$;

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
    discipline_order = r.discipline_order, match_formats = r.match_formats, created_by = r.created_by, mode = r.mode,
    tables = r.tables, attendees = coalesce(r.attendees, '{}'), notes = r.notes
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
    breaks, discipline_min, discipline_order, match_formats, created_by, mode, tables, attendees, notes)
  values (r.id, r.date, coalesce(r.start_time, '18:00'), coalesce(r.sim_split, 'performance'), r.sim_teams,
    coalesce(r.format, 'classic'), r.duration_min, r.plan, r.locked_rounds, r.breaks, r.discipline_min,
    r.discipline_order, r.match_formats, r.created_by, r.mode, r.tables, coalesce(r.attendees, '{}'), r.notes)
  returning * into res;
  return res;
end $$;
grant execute on function public.save_training(jsonb, int) to authenticated;
