-- Migrace 26: vlastní trénink (PRD 5.11) – založí ho každý hráč, zapisují oba jeho hráči, maže zakladatel.
begin;
select t.seed();
\set P '''20000000-0000-0000-0000-000000000009'''
\set T '''20000000-0000-0000-0000-000000000001'''
\set A '''10000000-0000-0000-0000-000000000003'''
\set B '''10000000-0000-0000-0000-000000000004'''
\set X '''10000000-0000-0000-0000-000000000005'''

set local role authenticated;
select t.as_player(:A);

-- Hráč bez role organizátora založí vlastní trénink se spoluhráčem.
select t.eq('hráč založí vlastní trénink', (public.save_training(jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000009', 'date', '2026-11-11', 'start_time', '17:30', 'mode', 'single', 'tables', 1,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004'),
  'created_by', '10000000-0000-0000-0000-000000000003', 'format', 'practice', 'duration_min', 0, 'plan', '{}'::jsonb,
  'sim_split', 'performance'), null)).format, 'practice');

-- Klubový trénink ale dál ne.
select t.fails('hráč nezaloží klubový trénink', format('select public.save_training(%L::jsonb, null)', jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000008', 'date', '2026-11-11', 'mode', 'team', 'tables', 2,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000003'), 'created_by', '10000000-0000-0000-0000-000000000003',
  'format', 'custom', 'duration_min', 60, 'plan', '{}'::jsonb)::text), '42501');

-- Nejvýš 2 hráči; zakladatel mezi nimi.
select t.fails('vlastní trénink nejvýš pro 2', format('select public.save_training(%L::jsonb, null)', jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000007', 'date', '2026-11-11', 'mode', 'single', 'tables', 1,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005'),
  'created_by', '10000000-0000-0000-0000-000000000003', 'format', 'practice', 'duration_min', 0, 'plan', '{}'::jsonb)::text), '23514');
select t.fails('vlastní trénink jen za sebe', format('select public.save_training(%L::jsonb, null)', jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000006', 'date', '2026-11-11', 'mode', 'single', 'tables', 1,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000004'),
  'created_by', '10000000-0000-0000-0000-000000000003', 'format', 'practice', 'duration_min', 0, 'plan', '{}'::jsonb)::text), '42501');

-- Zahájení a série.
select t.eq('zakladatel zahájí', (public.start_item(:P, 'training', now())).started_at is not null, true);
select t.eq('zakladatel zapíše za sebe', (public.tap_drill(:P, :A, 'penaltySolo', 1::smallint, 10,
  '[{"id":"p1","item":"series|1","kind":"hit","delta":1,"dvalue":1,"dattempts":1}]')).value, 1::smallint);
select t.eq('zakladatel zapíše za spoluhráče', (public.tap_drill(:P, :B, 'warmupPasses', 2::smallint, 20,
  '[{"id":"p2","item":"series|2","kind":"miss","delta":1,"dvalue":0,"dattempts":1}]')).attempts, 1::smallint);

select t.as_player(:B);
select t.eq('spoluhráč zapíše za zakladatele', (public.tap_drill(:P, :A, 'penaltySolo', 1::smallint, 10,
  '[{"id":"p3","item":"series|1","kind":"hit","delta":1,"dvalue":1,"dattempts":1}]')).value, 2::smallint);
select t.fails('za cizího hráče ani spoluhráč nezapíše', format('select public.tap_drill(%L, %L, %L, 1::smallint, 10, %L)', :P, :X, 'penaltySolo',
  '[{"id":"p4","item":"series|1","kind":"hit","delta":1,"dvalue":1,"dattempts":1}]'), '42501');
select t.eq('spoluhráč ukončí', (public.end_item(:P, 'training', null, now())).ended_at is not null, true);
select t.fails('spoluhráč nemění nastavení', format('select public.save_training(%L::jsonb, 1)', jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000009', 'date', '2026-11-12', 'mode', 'single', 'tables', 1,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004'),
  'created_by', '10000000-0000-0000-0000-000000000003', 'format', 'practice', 'duration_min', 0, 'plan', '{}'::jsonb)::text), '42501');
delete from public.trainings where id = :P;
select t.eq('spoluhráč nesmaže', (select count(*) from public.trainings where id = :P), 1::bigint);

-- Spoluhráč do klubového tréninku za druhého dál nezapíše (bez zamčeného kola).
select t.fails('klubový trénink beze změny', format('select public.tap_drill(%L, %L, %L, 1::smallint, 10, %L)', :T, :A, 'penaltySolo',
  '[{"id":"p5","item":"drill|x","kind":"hit","delta":1,"dvalue":1,"dattempts":1}]'), '42501');

-- Cizí hráč do vlastního tréninku nic nezapíše.
select t.as_player(:X);
select t.fails('cizí hráč nezapíše výsledek', format('select public.tap_drill(%L, %L, %L, 1::smallint, 10, %L)', :P, :A, 'penaltySolo',
  '[{"id":"p6","item":"series|1","kind":"hit","delta":1,"dvalue":1,"dattempts":1}]'), '42501');
select t.fails('cizí hráč neukončí', format('select public.start_item(%L, %L, now())', :P, 'other'), '42501');
select t.eq('cizí hráč vlastní trénink vidí', (select count(*) from public.trainings where id = :P), 1::bigint);

-- Zakladatel smaže.
select t.as_player(:A);
delete from public.trainings where id = :P;
select t.eq('zakladatel smaže', (select count(*) from public.trainings where id = :P), 0::bigint);

rollback;
