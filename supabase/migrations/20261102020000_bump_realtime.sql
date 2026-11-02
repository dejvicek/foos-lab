-- Migrace 8: zápis ťuknutím z více telefonů (PRD 7.1). Přičtení se sčítá v databázi, změny se šíří živě.

create or replace function public.bump_score(p_training uuid, p_match text, p_field text, p_delta int, p_max int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write_score(p_training, p_match) then
    raise exception 'Do tohoto zápasu nemůžeš zapisovat' using errcode = '42501';
  end if;
  if p_field not in ('ga', 'gb', 'la', 'lb') then raise exception 'Neznámé pole' using errcode = '22023'; end if;
  insert into public.scores (training_id, match_id) values (p_training, p_match) on conflict (training_id, match_id) do nothing;
  execute format(
    'update public.scores set %1$I = least(greatest(coalesce(%1$I, 0) + $1, 0), $2), updated_at = now() where training_id = $3 and match_id = $4',
    p_field) using p_delta, p_max, p_training, p_match;
end $$;

create or replace function public.bump_solo(p_training uuid, p_player uuid, p_metric text, p_round smallint, p_delta int, p_max int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write_solo(p_training, p_player, p_round) then
    raise exception 'Za tohoto hráče nemůžeš zapisovat' using errcode = '42501';
  end if;
  insert into public.solo_results (training_id, player_id, metric, round, value)
  values (p_training, p_player, p_metric, p_round, least(greatest(p_delta, 0), p_max))
  on conflict (training_id, player_id, metric, round)
  do update set value = least(greatest(public.solo_results.value + p_delta, 0), p_max), updated_at = now();
end $$;

grant execute on function public.bump_score(uuid, text, text, int, int), public.bump_solo(uuid, uuid, text, smallint, int, int) to authenticated;

-- Živé aktualizace pro ostatní telefony (RLS platí i pro Realtime).
do $$ begin
  alter publication supabase_realtime add table public.scores;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.solo_results;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.trainings;
exception when duplicate_object then null; end $$;
