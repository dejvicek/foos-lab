-- Migrace 25: uložení nastavení tréninku založené na zastaralém stavu se odmítne (save_training + verze);
-- zamčení kol verzi nemění a smí ho i organizátor, který nehraje.
begin;
select t.seed();
\set T '''20000000-0000-0000-0000-000000000001'''
\set N '''20000000-0000-0000-0000-000000000002'''
\set ORG '''10000000-0000-0000-0000-000000000002'''
\set A '''10000000-0000-0000-0000-000000000003'''

set local role authenticated;
select t.as_player(:ORG);

-- Nový trénink.
select t.eq('nový trénink má verzi 1', (public.save_training(jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000002', 'date', '2026-11-11', 'start_time', '18:30', 'mode', 'team', 'tables', 3,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000003'), 'created_by', '10000000-0000-0000-0000-000000000002',
  'format', 'custom', 'duration_min', 120, 'plan', '{"normal": 2}'::jsonb, 'sim_split', 'order'), null)).version, 1);
select t.eq('uložily se sloupce', (select start_time || ' ' || tables || ' ' || format || ' ' || (plan ->> 'normal') from public.trainings where id = :N), '18:30 3 custom 2');

-- Úprava se správnou verzí projde a verzi zvedne.
select t.eq('úprava zvedne verzi', (public.save_training(jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000002', 'date', '2026-11-11', 'start_time', '18:30', 'mode', 'team', 'tables', 4,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000003'), 'created_by', '10000000-0000-0000-0000-000000000002',
  'format', 'custom', 'duration_min', 120, 'plan', '{"normal": 2}'::jsonb, 'sim_split', 'order'), 1)).version, 2);

-- Úprava založená na starém stavu (verze 1) se odmítne a nic nezmění.
select t.fails('zastaralá úprava se odmítne', format('select public.save_training(%L::jsonb, 1)', jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000002', 'date', '2026-11-11', 'start_time', '18:30', 'mode', 'team', 'tables', 2,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000003'), 'created_by', '10000000-0000-0000-0000-000000000002',
  'format', 'custom', 'duration_min', 120, 'plan', '{"normal": 2}'::jsonb, 'sim_split', 'order')::text), 'FL409');
select t.eq('odmítnutá úprava nic nezměnila', (select tables || ' v' || version from public.trainings where id = :N), '4 v2');

-- Bez očekávané verze (první uložení ze zařízení, které verzi ještě nezná) projde vždy.
select t.eq('bez očekávané verze projde', (public.save_training(jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000002', 'date', '2026-11-11', 'start_time', '19:00', 'mode', 'team', 'tables', 4,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000003'), 'created_by', '10000000-0000-0000-0000-000000000002',
  'format', 'custom', 'duration_min', 120, 'plan', '{"normal": 2}'::jsonb, 'sim_split', 'order'), null)).version, 3);

-- Zamčení kol verzi nemění (hráči zamykají kola během tréninku – organizátorovi tím úpravu nezneplatní).
select t.as_player(:A);
select public.lock_rounds(:N, '[{"discipline": "normal", "rows": []}]'::jsonb, null);
select t.eq('zamčení kol verzi nemění', (select version from public.trainings where id = :N), 3);
select t.eq('kola jsou zamčená', (select jsonb_array_length(locked_rounds) from public.trainings where id = :N), 1);

-- Organizátor, který nehraje, smí zamknout kola svého tréninku.
select t.as_player(:ORG);
select public.lock_rounds(:N, '[{"discipline": "normal", "rows": []}, {"discipline": "wall", "rows": []}]'::jsonb, null);
select t.eq('organizátor zamkne kola', (select jsonb_array_length(locked_rounds) from public.trainings where id = :N), 2);

-- Uložení celého řádku starší verzí appky (bez funkce) verzi zvedne také.
update public.trainings set tables = 2 where id = :N;
select t.eq('přímá úprava zvedne verzi', (select version from public.trainings where id = :N), 4);
update public.trainings set tables = 2 where id = :N;
select t.eq('uložení beze změny verzi nezvedá', (select version from public.trainings where id = :N), 4);

-- Hráč trénink neuloží; cizí hráč kola nezamkne.
select t.as_player(:A);
select t.fails('hráč nastavení nezmění', format('select public.save_training(%L::jsonb, null)', jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000002', 'date', '2026-11-11', 'mode', 'team', 'tables', 1, 'attendees', '[]'::jsonb)::text), '42501');
select t.fails('hráč trénink nezaloží', format('select public.save_training(%L::jsonb, null)', jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000003', 'date', '2026-11-11', 'mode', 'team', 'tables', 1, 'attendees', '[]'::jsonb,
  'created_by', '10000000-0000-0000-0000-000000000003')::text), '42501');
select t.as_player('10000000-0000-0000-0000-000000000005');
select t.fails('cizí hráč kola nezamkne', format('select public.lock_rounds(%L, %L::jsonb, null)', :N, '[]'), '42501');

-- Úprava smazaného tréninku ho nezaloží znovu.
select t.as_player('10000000-0000-0000-0000-000000000002');
delete from public.trainings where id = '20000000-0000-0000-0000-000000000002';
select t.fails('úprava smazaného tréninku ho neobnoví', format('select public.save_training(%L::jsonb, 4)', jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000002', 'date', '2026-11-11', 'mode', 'team', 'tables', 2, 'attendees', '[]'::jsonb,
  'created_by', '10000000-0000-0000-0000-000000000002')::text), '23503');
select t.eq('smazaný trénink zůstal smazaný', (select count(*) from public.trainings where id = '20000000-0000-0000-0000-000000000002'), 0::bigint);

rollback;
