-- Migrace 31 (18. 11. 2026): připravenost místo Zahájit (PRD 4.8).
--  - play_times.ready: kdo se kdy přihlásil „Připraven“ ({"A": "…", "B": "…"} u zápasu, u cvičení ID hráčů).
--  - ready_item: přihlášení / odhlášení po jednom klíči. Utkání začne (started_at), až jsou připravení všichni
--    (p_keys), v čase posledního. Po zahájení se nic nemění; čas první připravenosti zůstává, takže zápis jde
--    bezpečně opakovat. Čas posílá telefon; čas z budoucnosti se ořízne na čas serveru.
--  - can_mark_ready: zápas – hráč své strany, rozhodčí (zamčené kolo) a organizátor kteroukoli; cvičení – hráč
--    za sebe; admin, zakladatel a hráč vlastního tréninku cokoli.
-- Starší verze appky zahajuje přes start_item (zůstává) – COMPAT 6. Dá se spustit opakovaně.

alter table public.play_times add column if not exists ready jsonb;

create or replace function public.can_mark_ready(p_training uuid, p_item text, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_creator(p_training) or public.is_practice_player(p_training) or (
    public.is_attendee(p_training) and (
      -- cvičení: hráč skupiny za sebe
      (p_item like 'drill|%' and p_key = public.current_player()::text and position(p_key in p_item) > 0)
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

create or replace function public.ready_item(p_training uuid, p_item text, p_key text, p_ready boolean, p_keys text[], p_at timestamptz)
returns public.play_times language plpgsql security definer set search_path = public as $$
declare
  res public.play_times;
  r jsonb;
  t timestamptz := least(coalesce(p_at, now()), now());
begin
  if not public.can_mark_ready(p_training, p_item, p_key) then
    raise exception 'Za tuto stranu nemůžeš hlásit připravenost' using errcode = '42501';
  end if;
  insert into public.play_times (training_id, item_id) values (p_training, p_item)
  on conflict (training_id, item_id) do nothing;
  select * into res from public.play_times where training_id = p_training and item_id = p_item for update;
  if res.started_at is not null then return res; end if;
  r := coalesce(res.ready, '{}'::jsonb);
  if p_ready then
    if not r ? p_key then r := r || jsonb_build_object(p_key, t); end if;
  else
    r := r - p_key;
  end if;
  update public.play_times
     set ready = nullif(r, '{}'::jsonb),
         started_at = case when coalesce(cardinality(p_keys), 0) > 0 and r ?& p_keys
                           then (select max((r ->> k)::timestamptz) from unnest(p_keys) k) end,
         updated_at = now()
   where training_id = p_training and item_id = p_item
  returning * into res;
  return res;
end $$;

grant execute on function public.can_mark_ready(uuid, text, text), public.ready_item(uuid, text, text, boolean, text[], timestamptz) to authenticated;
