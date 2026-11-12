-- Migrace 29 (12. 11. 2026): Udržení míče na pětce se počítá na góly (víc je lépe), dřív ztráty.
-- Starší výsledky (fiveBarControl, fiveBarSolo) se převedou: góly = odehrané série − ztráty (výsledek
-- zapsaný číslem bez počtu sérií = 10, jako migrace 27). Převod smí proběhnout jen jednou – záznam
-- v data_fixes ho při opakovaném spuštění přeskočí. updated_at = now(), ať si změnu stáhnou i telefony.

create table if not exists public.data_fixes (id text primary key, applied_at timestamptz not null default now());
alter table public.data_fixes enable row level security;

do $$
begin
  if not exists (select 1 from public.data_fixes where id = 'five_bar_goals') then
    update public.solo_results
       set value = greatest(0, coalesce(attempts, 10) - value), updated_at = now()
     where metric in ('fiveBarControl', 'fiveBarSolo');
    insert into public.data_fixes (id) values ('five_bar_goals');
  end if;
end $$;
