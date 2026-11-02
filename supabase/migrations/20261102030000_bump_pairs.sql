-- Migrace 9: ťuknutí na gól doplní soupeři 0 (stejně u ztrát), aby se leg 6:0 počítal jako zapsaný.
-- Dá se spustit opakovaně.

create or replace function public.bump_score(p_training uuid, p_match text, p_field text, p_delta int, p_max int)
returns void language plpgsql security definer set search_path = public as $$
declare
  pair text;
begin
  if not public.can_write_score(p_training, p_match) then
    raise exception 'Do tohoto zápasu nemůžeš zapisovat' using errcode = '42501';
  end if;
  if p_field not in ('ga', 'gb', 'la', 'lb') then raise exception 'Neznámé pole' using errcode = '22023'; end if;
  pair := case p_field when 'ga' then 'gb' when 'gb' then 'ga' when 'la' then 'lb' else 'la' end;
  insert into public.scores (training_id, match_id) values (p_training, p_match) on conflict (training_id, match_id) do nothing;
  execute format(
    'update public.scores set %1$I = least(greatest(coalesce(%1$I, 0) + $1, 0), $2), %2$I = coalesce(%2$I, 0), updated_at = now()
      where training_id = $3 and match_id = $4',
    p_field, pair) using p_delta, p_max, p_training, p_match;
end $$;

grant execute on function public.bump_score(uuid, text, text, int, int) to authenticated;
