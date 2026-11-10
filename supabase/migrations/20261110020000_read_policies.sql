-- Migrace 22 (10. 11. 2026): pravidla čtení rychlejší na velkých tabulkách.
-- Dřív se public.current_player() volalo u každého čteného řádku (u skóre a průběhu her tisíce řádků,
-- každé volání = dotaz do accounts). V poddotazu (select …) se vyhodnotí jednou na dotaz.
-- Kdo smí číst, se nemění: přihlášený účet propojený s hráčem. Dá se spustit opakovaně.

do $$
declare
  tbl text;
begin
  foreach tbl in array array['players', 'trainings', 'scores', 'solo_results', 'play_times', 'game_events', 'catalog'] loop
    execute format('drop policy if exists "read" on public.%I', tbl);
    execute format(
      'create policy "read" on public.%I for select to authenticated using ((select public.current_player()) is not null)', tbl);
  end loop;
end $$;
