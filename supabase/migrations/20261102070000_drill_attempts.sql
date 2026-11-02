-- Migrace 13: pokusy cvičení (PRD 5.8) – po každém pokusu ✓ / ✗, appka počítá pokusy i výsledek.
-- attempts null = výsledek zapsaný číslem = dokončené cvičení (plný počet). Dá se spustit opakovaně.

alter table public.solo_results add column if not exists attempts smallint;

-- Ťuknutí po pokusu: přičte k výsledku i k pokusům. Přes plný počet pokusů nepustí,
-- vracet (delta −1) jde jen pokus, který existuje. Souběžná ťuknutí z více telefonů se sčítají.
create or replace function public.tap_solo(p_training uuid, p_player uuid, p_metric text, p_round smallint, p_dvalue int, p_dattempts int, p_max int)
returns void language plpgsql security definer set search_path = public as $$
declare
  cur record;
  v int;
  a int;
begin
  if not public.can_write_solo(p_training, p_player, p_round) then
    raise exception 'Za tohoto hráče nemůžeš zapisovat' using errcode = '42501';
  end if;
  -- Řádek nejdřív založit (0 / 0) a zamknout, ať se souběžná první ťuknutí nepřepíšou.
  insert into public.solo_results (training_id, player_id, metric, round, value, attempts)
  values (p_training, p_player, p_metric, p_round, 0, 0)
  on conflict (training_id, player_id, metric, round) do nothing;
  select value, attempts into cur from public.solo_results
   where training_id = p_training and player_id = p_player and metric = p_metric and round = p_round
   for update;
  v := cur.value;
  a := coalesce(cur.attempts, p_max); -- zapsáno číslem = plný počet
  if p_dattempts > 0 and a >= p_max then return; end if;
  if p_dvalue < 0 and v <= 0 then return; end if;
  if p_dattempts < 0 and p_dvalue = 0 and a - v <= 0 then return; end if;
  update public.solo_results set value = v + p_dvalue, attempts = a + p_dattempts, updated_at = now()
   where training_id = p_training and player_id = p_player and metric = p_metric and round = p_round;
end $$;

grant execute on function public.tap_solo(uuid, uuid, text, smallint, int, int, int) to authenticated;
