-- Migrace 30 (18. 11. 2026): délka kola zápasu z doby míčku.
--  - trainings.ball_sec: doby míčků zápasů a simulace v sekundách ({"normal": 37, "sim": 37}), snímek katalogu
--    při založení / úpravě tréninku. Délka kola = doba míčku × nejvíc možných gólů ve formátu (appka).
--    null = délky kol z discipline_min jako dřív (starší tréninky si časy nechají).
--  - save_training ukládá i ball_sec.
-- Starší verze appky sloupec nezná (uložení tréninku by ho smazalo) → COMPAT 5. Dá se spustit opakovaně.

alter table public.trainings add column if not exists ball_sec jsonb;

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
    discipline_order = r.discipline_order, match_formats = r.match_formats, ball_sec = r.ball_sec, created_by = r.created_by, mode = r.mode,
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
    breaks, discipline_min, discipline_order, match_formats, ball_sec, created_by, mode, tables, attendees, notes)
  values (r.id, r.date, coalesce(r.start_time, '18:00'), coalesce(r.sim_split, 'performance'), r.sim_teams,
    coalesce(r.format, 'classic'), r.duration_min, r.plan, r.locked_rounds, r.breaks, r.discipline_min,
    r.discipline_order, r.match_formats, r.ball_sec, r.created_by, r.mode, r.tables, coalesce(r.attendees, '{}'), r.notes)
  returning * into res;
  return res;
end $$;
grant execute on function public.save_training(jsonb, int) to authenticated;
