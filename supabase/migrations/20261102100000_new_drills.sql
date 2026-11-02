-- Nová cvičení (2. 11. 2026): přihrávky ke zdi a po lajně, penalta a střela z dvojky proti brankáři / bez brankáře,
-- Udržení míče na pětce sólo. Stará Penalta z místa (setShooting) zůstává kvůli historii.
alter table public.solo_results drop constraint if exists solo_results_metric_check;
alter table public.solo_results add constraint solo_results_metric_check check (metric in (
  'warmupPasses', 'passWallLane', 'fiveBarControl', 'fiveBarSolo', 'setShooting', 'penaltyKeeper', 'penaltySolo',
  'backShotKeeper', 'backShotSolo', 'blockToControl', 'backRodsBuildUp', 'chain'
));
