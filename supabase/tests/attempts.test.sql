-- Migrace 27: 20 pokusů – starší výsledky zapsané číslem dostanou počet pokusů 10.
-- A Čistá desítka přes tap_drill: výsledek je čas (velký přírůstek) a vrátit jde poslední pokus série.
begin;
select t.seed();

\set T '''20000000-0000-0000-0000-000000000001'''
\set A '''10000000-0000-0000-0000-000000000003'''
\set B '''10000000-0000-0000-0000-000000000004'''

-- Starší výsledky bez počtu pokusů (jak je zapisovala appka před 20 pokusy).
insert into public.solo_results (training_id, player_id, metric, round, value, attempts) values
  (:T, :A, 'penaltySolo', 7, 6, null),
  (:T, :A, 'warmupPasses', 7, 15, null),
  (:T, :A, 'backRodsBuildUp', 7, 4, null),
  (:T, :B, 'clearing', 7, 8, 9);
-- Totéž co migrace 27 (testy běží po migracích, tyhle řádky vznikly až po nich).
update public.solo_results set attempts = 10 where attempts is null
   and metric in ('passWallLane', 'fiveBarControl', 'fiveBarSolo', 'penaltyKeeper', 'penaltySolo', 'backShotKeeper', 'backShotSolo', 'clearing', 'looseBall');
select t.eq('starší penalta je z 10', (select attempts from public.solo_results where player_id = :A and metric = 'penaltySolo' and round = 7), 10::smallint);
select t.eq('přihrávky na pětce měly 20 už dřív', (select attempts from public.solo_results where player_id = :A and metric = 'warmupPasses' and round = 7), null::smallint);
select t.eq('vyřazená rozehrávka zůstává', (select attempts from public.solo_results where player_id = :A and metric = 'backRodsBuildUp' and round = 7), null::smallint);
select t.eq('zapsaný počet pokusů se nemění', (select attempts from public.solo_results where player_id = :B and metric = 'clearing' and round = 7), 9::smallint);

-- Čistá desítka: devět povedených a nepovedený jen přičtou pokusy, desátý po sobě zapíše čas (sekundy).
select t.as_player(:A);
select public.tap_drill(:T, :A, 'streakShot3', 1::smallint, 500,
  '[{"id":"s1","item":"drill|s","kind":"hit","delta":1,"dvalue":0,"dattempts":1},{"id":"s2","item":"drill|s","kind":"miss","delta":1,"dvalue":0,"dattempts":1}]');
select t.eq('série: zatím bez času', (select value || '/' || attempts from public.solo_results where player_id = :A and metric = 'streakShot3'), '0/2');
select t.eq('desátý po sobě zapíše čas', (select value || '/' || attempts from public.tap_drill(:T, :A, 'streakShot3', 1::smallint, 500,
  '[{"id":"s3","item":"drill|s","kind":"hit","delta":1,"dvalue":125,"dattempts":1}]')), '125/3');
select t.eq('zpět posledního povedeného čas smaže', (select value || '/' || attempts from public.tap_drill(:T, :A, 'streakShot3', 1::smallint, 500,
  '[{"id":"s4","item":"drill|s","kind":"hit","delta":-1,"dvalue":-125,"dattempts":-1}]')), '0/2');
select t.eq('zpět nepovedeného před splněním', (select value || '/' || attempts from public.tap_drill(:T, :A, 'streakShot3', 1::smallint, 500,
  '[{"id":"s5","item":"drill|s","kind":"miss","delta":-1,"dvalue":0,"dattempts":-1}]')), '0/1');

rollback;
