-- Migrace 32 (20. 11. 2026): Připraven u cvičení smí nahlásit i spoluhráč ze skupiny u stolu (dřív jen hráč
-- za sebe) – jeden telefon u stolu stačí (*rozhodnutí uživatele*). Zápasy beze změny. Starší verze appky
-- tlačítko za spoluhráče nenabízí, s novým pravidlem běží dál. Dá se spustit opakovaně.

create or replace function public.can_mark_ready(p_training uuid, p_item text, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_creator(p_training) or public.is_practice_player(p_training) or (
    public.is_attendee(p_training) and (
      -- cvičení: hráč skupiny za sebe i za spoluhráče ze skupiny (ID „drill|kolo|stůl|H1+H2“)
      (p_item like 'drill|%' and p_key not in ('A', 'B')
        and position(p_key in split_part(p_item, '|', 4)) > 0
        and position(public.current_player()::text in split_part(p_item, '|', 4)) > 0)
      -- zápas: hráč své strany (ID „blok|kolo|stůl|A1+A2vB1+B2“)
      or (p_key in ('A', 'B') and position(public.current_player()::text in
            split_part(split_part(p_item, '|', 4), 'v', case when p_key = 'A' then 1 else 2 end)) > 0)
      -- zápas: rozhodčí u stolu (zamčené kolo) kteroukoli stranu
      or (p_key in ('A', 'B') and exists (
        select 1 from public.trainings t,
          jsonb_array_elements(coalesce(t.locked_rounds, '[]'::jsonb)) lr,
          jsonb_array_elements(lr -> 'rows') r,
          jsonb_array_elements(r -> 'cells') c
         where t.id = p_training and c ->> 'type' = 'match'
           and c -> 'match' ->> 'id' = p_item
           and c -> 'match' ->> 'referee' = public.current_player()::text))))
$$;
