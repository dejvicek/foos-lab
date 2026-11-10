-- Migrace 20 (10. 11. 2026, rozhodnutí uživatele): role organizátora.
-- Tréninky zakládá jen admin a organizátor; zakladatel spravuje svůj trénink, jen když je organizátor
-- (nastavení, mazání, zápis všech výsledků a časů). Organizátora nastavuje admin na stránce Hráči.
-- Kdo už nějaký trénink založil, dostane roli organizátora, aby o správu svých tréninků nepřišel.
-- Dá se spustit opakovaně.

alter table public.players add column if not exists is_organizer boolean not null default false;

update public.players p set is_organizer = true
 where not p.is_organizer and exists (select 1 from public.trainings t where t.created_by = p.id);

create or replace function public.is_organizer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_organizer and not p.archived from public.players p where p.id = public.current_player()), false)
$$;
grant execute on function public.is_organizer() to authenticated;

-- Zakladatel = organizátor, který trénink založil. Na is_creator stojí can_write_score / can_write_solo
-- (skóre, výsledky cvičení, časy utkání a pauz, průběh hry), takže se změna promítne všude.
create or replace function public.is_creator(p_training uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_organizer() and exists (
    select 1 from public.trainings t where t.id = p_training and t.created_by is not null and t.created_by = public.current_player())
$$;

-- Tréninky: založit smí admin, nebo organizátor jako zakladatel; měnit a mazat admin nebo organizátor-zakladatel.
drop policy if exists "insert" on public.trainings;
drop policy if exists "manage" on public.trainings;
drop policy if exists "delete" on public.trainings;
create policy "insert" on public.trainings for insert to authenticated
  with check (public.is_admin() or (public.is_organizer() and created_by = public.current_player()));
create policy "manage" on public.trainings for update to authenticated
  using (public.is_admin() or (public.is_organizer() and created_by = public.current_player()))
  with check (public.is_admin() or (public.is_organizer() and created_by = public.current_player()));
create policy "delete" on public.trainings for delete to authenticated
  using (public.is_admin() or (public.is_organizer() and created_by = public.current_player()));

-- Hráči: nového hráče (z průvodce tréninku) přidá admin nebo organizátor; bez admin ani organizátorské role.
-- Měnit (vč. role organizátora) a mazat dál jen admin.
drop policy if exists "insert" on public.players;
create policy "insert" on public.players for insert to authenticated
  with check (public.is_admin() or (public.is_organizer() and is_admin = false and is_organizer = false));
