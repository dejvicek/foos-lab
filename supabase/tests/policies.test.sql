-- Migrace 22: pravidla čtení vyhodnotí přihlášeného hráče jednou na dotaz, ne na každém řádku;
-- kdo smí číst, se nemění.
begin;
select t.seed();
insert into public.scores (training_id, match_id, ga, gb) values ('20000000-0000-0000-0000-000000000001', 'm', 1, 0);
insert into public.solo_results (training_id, player_id, metric, round, value)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'chain', 0, 3);
insert into public.play_times (training_id, item_id, started_at) values ('20000000-0000-0000-0000-000000000001', 'training', now());
insert into public.game_events (id, training_id, item_id, kind, delta) values ('e1', '20000000-0000-0000-0000-000000000001', 'm', 'goal', 1);
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000009', 'bez-hrace@test');

set local role authenticated;

-- Hráč čte všechno.
select t.as_player('10000000-0000-0000-0000-000000000003');
select t.eq('hráč čte hráče', (select count(*) from public.players), 5::bigint);
select t.eq('hráč čte tréninky', (select count(*) from public.trainings), 1::bigint);
select t.eq('hráč čte skóre', (select count(*) from public.scores), 1::bigint);
select t.eq('hráč čte výsledky cvičení', (select count(*) from public.solo_results), 1::bigint);
select t.eq('hráč čte časy utkání', (select count(*) from public.play_times), 1::bigint);
select t.eq('hráč čte průběh hry', (select count(*) from public.game_events), 1::bigint);
select t.eq('hráč čte katalog', (select count(*) from public.catalog), 1::bigint);

-- Přihlášený hráč se zjišťuje jednou na dotaz.
select t.eq('players: jednou na dotaz', t.plan_has('select * from public.players', 'InitPlan'), true);
select t.eq('trainings: jednou na dotaz', t.plan_has('select * from public.trainings', 'InitPlan'), true);
select t.eq('scores: jednou na dotaz', t.plan_has('select * from public.scores', 'InitPlan'), true);
select t.eq('solo_results: jednou na dotaz', t.plan_has('select * from public.solo_results', 'InitPlan'), true);
select t.eq('play_times: jednou na dotaz', t.plan_has('select * from public.play_times', 'InitPlan'), true);
select t.eq('game_events: jednou na dotaz', t.plan_has('select * from public.game_events', 'InitPlan'), true);
select t.eq('catalog: jednou na dotaz', t.plan_has('select * from public.catalog', 'InitPlan'), true);

-- Účet bez hráče nečte nic.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000009', true);
select t.eq('účet bez hráče: hráči', (select count(*) from public.players), 0::bigint);
select t.eq('účet bez hráče: skóre', (select count(*) from public.scores), 0::bigint);
select t.eq('účet bez hráče: průběh', (select count(*) from public.game_events), 0::bigint);

-- Nepřihlášený nečte nic.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select t.eq('nepřihlášený: hráči', (select count(*) from public.players), 0::bigint);
select t.eq('nepřihlášený: tréninky', (select count(*) from public.trainings), 0::bigint);

rollback;
