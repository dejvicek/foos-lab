-- Migrace 18 (9. 11. 2026): katalog disciplín a štítků, který upravuje admin na stránce Disciplíny.
-- catalog: jeden řádek (id = 1), v data jen rozdíly proti výchozím hodnotám z kódu:
--   {"disciplines": {"wall": {"name": "…", "min": 10, "optional": true, "skills": ["tempo"], "help": [{"label": "Cíl:", "text": "…"}]}},
--    "skills": [{"id": "shot3", "name": "Střela z trojky", "group": "attack"}, …]}
-- trainings.discipline_min: délky kol uložené při založení / úpravě tréninku ({"wall": 8, …});
--   null = trénink založený dřív, platí výchozí délky z kódu (jeho časy se změnou katalogu nehnou).
-- Dá se spustit opakovaně.

create table if not exists public.catalog (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.catalog (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

alter table public.catalog enable row level security;
drop policy if exists "read" on public.catalog;
drop policy if exists "admin write" on public.catalog;
create policy "read" on public.catalog for select to authenticated using (public.current_player() is not null);
create policy "admin write" on public.catalog for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.trainings add column if not exists discipline_min jsonb;
