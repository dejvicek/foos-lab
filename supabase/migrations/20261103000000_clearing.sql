-- Cvičení Clearing a Zachycení volného míče (3. 11. 2026): nové metriky v solo_results.
alter table public.solo_results drop constraint if exists solo_results_metric_check;
alter table public.solo_results add constraint solo_results_metric_check check (metric in (
  'warmupPasses', 'passWallLane', 'fiveBarControl', 'fiveBarSolo', 'setShooting', 'penaltyKeeper', 'penaltySolo',
  'backShotKeeper', 'backShotSolo', 'clearing', 'looseBall', 'backRodsBuildUp', 'chain'
));
