-- Migrace 6: přihlášení a práva (PRD 4.7). Dá se spustit opakovaně.
-- Heslo = přezdívka (přesně jak je na soupisce) + pevná přípona, kterou přidává i klient,
-- aby splnilo minimální délku hesla v Supabase Auth.

alter table public.players add column if not exists is_admin boolean not null default false;
update public.players set is_admin = true where name = 'Dejv';

create table if not exists public.accounts (
  player_id uuid primary key references public.players (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.accounts enable row level security;

create or replace function public.pw_suffix() returns text language sql immutable as $$ select '#rozpis-stolu' $$;
create or replace function public.account_email(p uuid) returns text language sql immutable as $$
  select 'p-' || p::text || '@hraci.rozpis-stolu.cz'
$$;

create or replace function public.current_player() returns uuid
language sql stable security definer set search_path = public as $$
  select player_id from public.accounts where user_id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.players p join public.accounts a on a.player_id = p.id where a.user_id = auth.uid()), false)
$$;

-- Přihlášení: podle přezdívky najde hráče; když ještě nemá účet, založí ho s heslem = přezdívka.
create or replace function public.login_prepare(p_nick text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl record;
  uid uuid;
  mail text;
begin
  select id, name into pl from public.players
   where lower(name) = lower(trim(p_nick)) and archived = false limit 1;
  if pl.id is null then return null; end if;
  mail := public.account_email(pl.id);
  if not exists (select 1 from public.accounts where player_id = pl.id) then
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
      crypt(pl.name || public.pw_suffix(), gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('player_id', pl.id), now(), now(), '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), uid::text, uid, jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true), 'email', now(), now(), now());
    insert into public.accounts (player_id, user_id) values (pl.id, uid);
  end if;
  return mail;
end $$;

create or replace function public.my_account() returns table (player_id uuid, is_admin boolean, must_change_password boolean)
language sql stable security definer set search_path = public as $$
  select a.player_id, p.is_admin, a.must_change_password
    from public.accounts a join public.players p on p.id = a.player_id
   where a.user_id = auth.uid()
$$;

create or replace function public.password_changed() returns void
language sql security definer set search_path = public as $$
  update public.accounts set must_change_password = false where user_id = auth.uid()
$$;

-- Admin: heslo zpět na přezdívku, hráč si ho musí znovu nastavit.
create or replace function public.admin_reset_password(p_player uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  acc record;
begin
  if not public.is_admin() then raise exception 'Jen admin může resetovat heslo' using errcode = '42501'; end if;
  select a.user_id, p.name into acc from public.accounts a join public.players p on p.id = a.player_id where a.player_id = p_player;
  if acc.user_id is null then return false; end if;
  update auth.users set encrypted_password = crypt(acc.name || public.pw_suffix(), gen_salt('bf')), updated_at = now() where id = acc.user_id;
  update public.accounts set must_change_password = true where player_id = p_player;
  return true;
end $$;

create or replace function public.is_attendee(p_training uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trainings t where t.id = p_training and public.current_player() = any (t.attendees))
$$;

-- Zápis skóre: admin; hráč jen v zápase, kde hraje (ID zápasu obsahuje ID hráčů), nebo kde je rozhodčí (zamčené kolo).
create or replace function public.can_write_score(p_training uuid, p_match text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
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

-- Zápis výsledku cvičení: admin; hráč za sebe, nebo za hráče ze své skupiny u stolu (zamčené kolo).
create or replace function public.can_write_solo(p_training uuid, p_player uuid, p_round smallint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
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

-- Zamčení kol hráčem: jen prodloužení zamčené části, týmy simulace jen poprvé.
create or replace function public.lock_rounds(p_training uuid, p_locked jsonb, p_sim_teams jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  old jsonb;
  i int;
begin
  if not (public.is_admin() or public.is_attendee(p_training)) then
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

grant execute on function public.login_prepare(text) to anon, authenticated;
grant execute on function public.my_account(), public.password_changed(), public.admin_reset_password(uuid),
  public.lock_rounds(uuid, jsonb, jsonb), public.current_player(), public.is_admin() to authenticated;

-- Pravidla přístupu: anon nic, přihlášení čtou, zápis podle rolí.
drop policy if exists "anon all" on public.players;
drop policy if exists "anon all" on public.trainings;
drop policy if exists "anon all" on public.scores;
drop policy if exists "anon all" on public.solo_results;

drop policy if exists "read" on public.players;
drop policy if exists "admin write" on public.players;
create policy "read" on public.players for select to authenticated using (public.current_player() is not null);
create policy "admin write" on public.players for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read" on public.trainings;
drop policy if exists "admin write" on public.trainings;
create policy "read" on public.trainings for select to authenticated using (public.current_player() is not null);
create policy "admin write" on public.trainings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read" on public.scores;
drop policy if exists "write" on public.scores;
create policy "read" on public.scores for select to authenticated using (public.current_player() is not null);
create policy "write" on public.scores for all to authenticated
  using (public.can_write_score(training_id, match_id)) with check (public.can_write_score(training_id, match_id));

drop policy if exists "read" on public.solo_results;
drop policy if exists "write" on public.solo_results;
create policy "read" on public.solo_results for select to authenticated using (public.current_player() is not null);
create policy "write" on public.solo_results for all to authenticated
  using (public.can_write_solo(training_id, player_id, round)) with check (public.can_write_solo(training_id, player_id, round));

drop policy if exists "own or admin" on public.accounts;
create policy "own or admin" on public.accounts for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Veřejná registrace je vypnutá v nastavení Auth (disable_signup); účty zakládá jen login_prepare.
-- Číst smí jen účet propojený s hráčem (ne libovolný uživatel Supabase Auth).
