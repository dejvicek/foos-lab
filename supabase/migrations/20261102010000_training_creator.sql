-- Migrace 7: tréninky zakládají všichni hráči; zakladatel má u svého tréninku práva admina (PRD 4.7).
-- Dá se spustit opakovaně.

alter table public.trainings add column if not exists created_by uuid references public.players (id) on delete set null;

create or replace function public.is_creator(p_training uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trainings t where t.id = p_training and t.created_by is not null and t.created_by = public.current_player())
$$;
grant execute on function public.is_creator(uuid) to authenticated;

create or replace function public.can_write_score(p_training uuid, p_match text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_creator(p_training) or (
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

create or replace function public.can_write_solo(p_training uuid, p_player uuid, p_round smallint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_creator(p_training) or (
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

-- Tréninky: založit smí každý hráč (jako zakladatel), měnit a mazat admin nebo zakladatel.
drop policy if exists "admin write" on public.trainings;
drop policy if exists "insert" on public.trainings;
drop policy if exists "manage" on public.trainings;
drop policy if exists "delete" on public.trainings;
create policy "insert" on public.trainings for insert to authenticated
  with check (public.is_admin() or (public.current_player() is not null and created_by = public.current_player()));
create policy "manage" on public.trainings for update to authenticated
  using (public.is_admin() or created_by = public.current_player())
  with check (public.is_admin() or created_by = public.current_player());
create policy "delete" on public.trainings for delete to authenticated
  using (public.is_admin() or created_by = public.current_player());

-- Hráči: přidat (bez admin práv) smí každý hráč – zakladatel tréninku přidává nové hráče;
-- měnit a mazat jen admin.
drop policy if exists "admin write" on public.players;
drop policy if exists "insert" on public.players;
drop policy if exists "admin update" on public.players;
drop policy if exists "admin delete" on public.players;
create policy "insert" on public.players for insert to authenticated
  with check (public.is_admin() or (public.current_player() is not null and is_admin = false));
create policy "admin update" on public.players for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete" on public.players for delete to authenticated using (public.is_admin());
