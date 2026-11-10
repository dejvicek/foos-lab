-- Migrace 21 (10. 11. 2026): zápisy, které jde bezpečně opakovat na pomalém spojení.
--
-- tap_score / tap_drill: ťuknutí a jeho událost (průběh hry) v jednom volání a jedné transakci.
--   Událost má ID ze zařízení; když už v databázi je, ťuknutí se podruhé nezapočítá. Appka tak smí
--   zápis po chybě sítě opakovat, i když první pokus ve skutečnosti prošel (ztratila se jen odpověď).
--   V jednom volání může být víc ťuknutí (Daň za ztrátu = ztráta + gól soupeře; rychlá série).
--   Vrací výsledný řádek – telefon podle něj srovná stav, i když mezitím ťukal někdo jiný.
-- start_item / end_item: zahájení a konec utkání po jednotlivých polích. Čas se zapíše, jen když
--   ještě není – opožděné „Zahájit“ z telefonu bez spojení už dohrané utkání znovu neotevře.
--   Čas posílá telefon (kdy hráč ťukl, ne kdy zápis dorazil); čas z budoucnosti se ořízne na čas serveru.
--
-- Starší bump_score / tap_solo / přímý zápis do play_times zůstávají pro telefony se starší verzí appky.
-- Dá se spustit opakovaně.

create or replace function public.tap_score(p_training uuid, p_match text, p_taps jsonb)
returns public.scores language plpgsql security definer set search_path = public as $$
declare
  tap jsonb;
  f text;
  pair text;
  n int;
  res public.scores;
begin
  if not public.can_write_score(p_training, p_match) then
    raise exception 'Do tohoto zápasu nemůžeš zapisovat' using errcode = '42501';
  end if;
  for tap in select * from jsonb_array_elements(p_taps) loop
    f := tap ->> 'field';
    if f is null or f not in ('ga', 'gb', 'la', 'lb') then raise exception 'Neznámé pole' using errcode = '22023'; end if;
    insert into public.game_events (id, training_id, item_id, at, kind, side, delta)
    values (tap ->> 'id', p_training, p_match, coalesce((tap ->> 'at')::timestamptz, now()),
            case when f in ('ga', 'gb') then 'goal' else 'loss' end,
            case when f in ('ga', 'la') then 'A' else 'B' end,
            case when (tap ->> 'delta')::int < 0 then -1 else 1 end)
    on conflict (id) do nothing;
    get diagnostics n = row_count;
    if n = 0 then continue; end if; -- už započítáno (opakovaný zápis)
    pair := case f when 'ga' then 'gb' when 'gb' then 'ga' when 'la' then 'lb' else 'la' end;
    insert into public.scores (training_id, match_id) values (p_training, p_match) on conflict (training_id, match_id) do nothing;
    execute format(
      'update public.scores set %1$I = least(greatest(coalesce(%1$I, 0) + $1, 0), $2), %2$I = coalesce(%2$I, 0), updated_at = now()
        where training_id = $3 and match_id = $4',
      f, pair) using (tap ->> 'delta')::int, (tap ->> 'max')::int, p_training, p_match;
  end loop;
  select * into res from public.scores where training_id = p_training and match_id = p_match;
  return res;
end $$;

-- Pokusy cvičení: stejné meze jako tap_solo (přes plný počet ne, vracet jen pokus, který existuje).
-- Ťuknutí odmítnuté mezí nenechá událost.
create or replace function public.tap_drill(p_training uuid, p_player uuid, p_metric text, p_round smallint, p_max int, p_taps jsonb)
returns public.solo_results language plpgsql security definer set search_path = public as $$
declare
  tap jsonb;
  cur record;
  v int;
  a int;
  dv int;
  da int;
  n int;
  res public.solo_results;
begin
  if not public.can_write_solo(p_training, p_player, p_round) then
    raise exception 'Za tohoto hráče nemůžeš zapisovat' using errcode = '42501';
  end if;
  -- Řádek nejdřív založit (0 / 0) a zamknout, ať se souběžná ťuknutí nepřepíšou.
  insert into public.solo_results (training_id, player_id, metric, round, value, attempts)
  values (p_training, p_player, p_metric, p_round, 0, 0)
  on conflict (training_id, player_id, metric, round) do nothing;
  select value, attempts into cur from public.solo_results
   where training_id = p_training and player_id = p_player and metric = p_metric and round = p_round
   for update;
  v := cur.value;
  a := coalesce(cur.attempts, p_max); -- zapsáno číslem = plný počet
  for tap in select * from jsonb_array_elements(p_taps) loop
    dv := (tap ->> 'dvalue')::int;
    da := (tap ->> 'dattempts')::int;
    if tap ->> 'kind' is null or tap ->> 'kind' not in ('hit', 'miss') then raise exception 'Neznámý druh pokusu' using errcode = '22023'; end if;
    if da > 0 and a >= p_max then continue; end if;
    if dv < 0 and v <= 0 then continue; end if;
    if da < 0 and dv = 0 and a - v <= 0 then continue; end if;
    insert into public.game_events (id, training_id, item_id, at, kind, player_id, delta)
    values (tap ->> 'id', p_training, tap ->> 'item', coalesce((tap ->> 'at')::timestamptz, now()),
            tap ->> 'kind', p_player, case when (tap ->> 'delta')::int < 0 then -1 else 1 end)
    on conflict (id) do nothing;
    get diagnostics n = row_count;
    if n = 0 then continue; end if; -- už započítáno (opakovaný zápis)
    v := v + dv;
    a := a + da;
  end loop;
  update public.solo_results set value = v, attempts = a, updated_at = now()
   where training_id = p_training and player_id = p_player and metric = p_metric and round = p_round
  returning * into res;
  return res;
end $$;

create or replace function public.start_item(p_training uuid, p_item text, p_at timestamptz)
returns public.play_times language plpgsql security definer set search_path = public as $$
declare
  res public.play_times;
begin
  if not public.can_write_score(p_training, p_item) then
    raise exception 'Toto utkání nemůžeš zahájit' using errcode = '42501';
  end if;
  insert into public.play_times (training_id, item_id, started_at)
  values (p_training, p_item, least(coalesce(p_at, now()), now()))
  on conflict (training_id, item_id) do update
    set started_at = coalesce(public.play_times.started_at, excluded.started_at), updated_at = now()
  returning * into res;
  return res;
end $$;

create or replace function public.end_item(p_training uuid, p_item text, p_started timestamptz, p_ended timestamptz)
returns public.play_times language plpgsql security definer set search_path = public as $$
declare
  res public.play_times;
begin
  if not public.can_write_score(p_training, p_item) then
    raise exception 'Toto utkání nemůžeš ukončit' using errcode = '42501';
  end if;
  insert into public.play_times (training_id, item_id, started_at, ended_at)
  -- least() by prázdné zahájení nahradil časem serveru – pauza spuštěná bez zahájení zůstává bez něj.
  values (p_training, p_item, case when p_started is null then null else least(p_started, now()) end,
          least(coalesce(p_ended, now()), now()))
  on conflict (training_id, item_id) do update
    set started_at = coalesce(public.play_times.started_at, excluded.started_at),
        ended_at = coalesce(public.play_times.ended_at, excluded.ended_at),
        updated_at = now()
  returning * into res;
  return res;
end $$;

grant execute on function public.tap_score(uuid, text, jsonb), public.tap_drill(uuid, uuid, text, smallint, int, jsonb),
  public.start_item(uuid, text, timestamptz), public.end_item(uuid, text, timestamptz, timestamptz) to authenticated;
