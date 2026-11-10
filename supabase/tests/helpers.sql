-- Společné pomůcky testů: porovnání, přihlášení za hráče, očekávaná chyba.
create schema if not exists t;
grant usage on schema t to anon, authenticated;

create or replace function t.eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: je %, má být %', label, got, want; end if;
  raise notice 'ok %', label;
end $$;

-- Další dotazy v transakci běží jako tento hráč (auth.uid() = jeho účet).
create or replace function t.as_player(p uuid) returns void language sql security definer as $$
  select set_config('request.jwt.claim.sub', (select user_id::text from public.accounts where player_id = p), true)
$$;

-- Dotaz musí skončit chybou s daným kódem (SQLSTATE).
create or replace function t.fails(label text, q text, code text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlstate = code then raise notice 'ok %', label; return; end if;
    raise exception 'FAIL %: chyba % (%), má být %', label, sqlstate, sqlerrm, code;
  end;
  raise exception 'FAIL %: prošlo, má skončit chybou %', label, code;
end $$;

-- Základní data: admin, organizátor-zakladatel, dva hráči tréninku, cizí hráč; jeden trénink.
create or replace function t.seed() returns void language plpgsql as $$
begin
  insert into auth.users (id, email)
  select ('a0000000-0000-0000-0000-00000000000' || n)::uuid, 'u' || n || '@test' from generate_series(1, 5) n;
  insert into public.players (id, name, sort_order, is_admin, is_organizer) values
    ('10000000-0000-0000-0000-000000000001', 'Admin', 0, true, false),
    ('10000000-0000-0000-0000-000000000002', 'Org', 1, false, true),
    ('10000000-0000-0000-0000-000000000003', 'Hrac A', 2, false, false),
    ('10000000-0000-0000-0000-000000000004', 'Hrac B', 3, false, false),
    ('10000000-0000-0000-0000-000000000005', 'Cizi', 4, false, false);
  insert into public.accounts (player_id, user_id)
  select ('10000000-0000-0000-0000-00000000000' || n)::uuid, ('a0000000-0000-0000-0000-00000000000' || n)::uuid from generate_series(1, 5) n;
  insert into public.trainings (id, date, mode, tables, attendees, created_by) values
    ('20000000-0000-0000-0000-000000000001', '2026-11-10', 'team', 2,
     array['10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004']::uuid[],
     '10000000-0000-0000-0000-000000000002');
end $$;

-- Obsahuje plán dotazu daný text? (Např. InitPlan = funkce v pravidle přístupu se vyhodnotí jednou, ne na každém řádku.)
create or replace function t.plan_has(q text, needle text) returns boolean language plpgsql as $$
declare
  line text;
begin
  for line in execute 'explain ' || q loop
    if position(needle in line) > 0 then return true; end if;
  end loop;
  return false;
end $$;
