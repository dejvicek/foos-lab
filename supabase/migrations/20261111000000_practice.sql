-- Migrace 26 (11. 11. 2026, PRD 5.11): vlastní trénink – hráč cvičí sám nebo ve dvou mimo klub.
--
-- Vlastní trénink je řádek `trainings` s format = 'practice' (1–2 hráči, zakladatel mezi nimi).
--  - založit ho smí každý hráč (nemusí být organizátor), měnit a mazat zakladatel nebo admin;
--  - výsledky cvičení (tap_drill, solo_results) a zahájení / konec (start_item / end_item, play_times)
--    zapisují oba hráči vlastního tréninku – každý i za druhého;
--  - klubových tréninků se nic nemění.
-- Starší verze appky vlastní tréninky nezná (appka zvedá COMPAT). Dá se spustit opakovaně.

alter table public.trainings drop constraint if exists trainings_format_check;
alter table public.trainings add constraint trainings_format_check check (format in ('classic', 'custom', 'practice'));

alter table public.trainings drop constraint if exists trainings_practice_check;
alter table public.trainings add constraint trainings_practice_check check (
  format <> 'practice' or (cardinality(attendees) between 1 and 2 and (created_by is null or created_by = any (attendees))));

-- Je přihlášený hráč účastníkem vlastního tréninku?
create or replace function public.is_practice_player(p_training uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trainings t
                  where t.id = p_training and t.format = 'practice' and public.current_player() = any (t.attendees))
$$;
grant execute on function public.is_practice_player(uuid) to authenticated;

-- Zápis skóre a časů utkání (play_times, start_item / end_item): navíc účastník vlastního tréninku.
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
           and c -> 'match' ->> 'id' = p_match
           and c -> 'match' ->> 'referee' = public.current_player()::text)))
$$;

-- Zápis výsledku cvičení: navíc účastník vlastního tréninku za kteréhokoli z jeho hráčů.
create or replace function public.can_write_solo(p_training uuid, p_player uuid, p_round smallint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_creator(p_training)
    or (public.is_practice_player(p_training)
        and exists (select 1 from public.trainings t where t.id = p_training and p_player = any (t.attendees)))
    or (
    public.is_attendee(p_training) and (
      p_player = public.current_player()
      or exists (
        select 1 from public.trainings t,
          jsonb_array_elements(coalesce(t.locked_rounds, '[]'::jsonb)) lr,
          jsonb_array_elements(lr -> 'rows') r,
          jsonb_array_elements(r -> 'cells') c
         where t.id = p_training and (r ->> 'roundNo')::int = p_round and c ->> 'type' = 'group'
           and (c -> 'players') ? public.current_player()::text
           and (c -> 'players') ? p_player::text)))
$$;

-- Tréninky: klubový zakládá admin nebo organizátor (beze změny); vlastní kterýkoli hráč jako zakladatel a účastník.
drop policy if exists "insert" on public.trainings;
drop policy if exists "manage" on public.trainings;
drop policy if exists "delete" on public.trainings;
create policy "insert" on public.trainings for insert to authenticated
  with check (public.is_admin()
    or (public.is_organizer() and created_by = public.current_player())
    or (format = 'practice' and created_by = public.current_player() and public.current_player() = any (attendees)));
create policy "manage" on public.trainings for update to authenticated
  using (public.is_admin()
    or (public.is_organizer() and created_by = public.current_player())
    or (format = 'practice' and created_by = public.current_player()))
  with check (public.is_admin()
    or (public.is_organizer() and created_by = public.current_player())
    or (format = 'practice' and created_by = public.current_player() and public.current_player() = any (attendees)));
create policy "delete" on public.trainings for delete to authenticated
  using (public.is_admin()
    or (public.is_organizer() and created_by = public.current_player())
    or (format = 'practice' and created_by = public.current_player()));
