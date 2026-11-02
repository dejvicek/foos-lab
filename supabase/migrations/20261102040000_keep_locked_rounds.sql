-- Migrace 10: zamčená kola se jen prodlužují. Uložení tréninku se zastaralým (kratším) seznamem
-- – např. správce, kterému nedorazila změna z jiného telefonu – zamčená kola nezkrátí.
-- Dá se spustit opakovaně.

create or replace function public.keep_locked_rounds() returns trigger
language plpgsql set search_path = public as $$
begin
  if jsonb_array_length(coalesce(new.locked_rounds, '[]'::jsonb)) < jsonb_array_length(coalesce(old.locked_rounds, '[]'::jsonb)) then
    new.locked_rounds := old.locked_rounds;
  end if;
  return new;
end $$;

drop trigger if exists keep_locked_rounds on public.trainings;
create trigger keep_locked_rounds before update on public.trainings
  for each row execute function public.keep_locked_rounds();
