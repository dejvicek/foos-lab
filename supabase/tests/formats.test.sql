-- Migrace 28: BO formát – trainings.match_formats přes save_training, rozhodčí zapisuje i další legy (`ID#n`).
begin;
select t.seed();
\set T '''20000000-0000-0000-0000-000000000001'''
\set N '''20000000-0000-0000-0000-000000000003'''
\set ORG '''10000000-0000-0000-0000-000000000002'''
\set A '''10000000-0000-0000-0000-000000000003'''
\set X '''10000000-0000-0000-0000-000000000005'''
\set M '''league|1|1|10000000-0000-0000-0000-000000000004v10000000-0000-0000-0000-000000000002'''

-- Zamčené kolo: zápas B proti Org, rozhoduje A.
update public.trainings set locked_rounds = jsonb_build_array(jsonb_build_object('discipline', 'normal', 'rows', jsonb_build_array(
  jsonb_build_object('cells', jsonb_build_array(jsonb_build_object('type', 'match', 'match', jsonb_build_object(
    'id', 'league|1|1|10000000-0000-0000-0000-000000000004v10000000-0000-0000-0000-000000000002',
    'referee', '10000000-0000-0000-0000-000000000003', 'bestOf', 3))))))) where id = :T;

set local role authenticated;
select t.as_player(:ORG);
select t.eq('nový trénink uloží formát', (public.save_training(jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000003', 'date', '2026-11-12', 'mode', 'team', 'tables', 2,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000003'), 'created_by', '10000000-0000-0000-0000-000000000002',
  'format', 'custom', 'duration_min', 120, 'plan', '{"normal": 1}'::jsonb,
  'match_formats', '{"normal": {"bestOf": 3, "legTo": 5}}'::jsonb), null)).match_formats -> 'normal' ->> 'bestOf', '3');
select t.eq('úprava formát změní', (public.save_training(jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000003', 'date', '2026-11-12', 'mode', 'team', 'tables', 2,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000003'), 'created_by', '10000000-0000-0000-0000-000000000002',
  'format', 'custom', 'duration_min', 120, 'plan', '{"normal": 1}'::jsonb,
  'match_formats', '{"normal": {"bestOf": 5, "legTo": 6, "finalWinBy2": true, "cap": 9}}'::jsonb), 1)).match_formats -> 'normal' ->> 'cap', '9');

select t.as_player(:A);
select t.eq('rozhodčí zapíše leg 1', public.can_write_score(:T, :M), true);
select t.eq('rozhodčí zapíše i leg 2', public.can_write_score(:T, :M || '#2'), true);
select t.eq('jiný zápas ne', public.can_write_score(:T, 'league|1|2|xvy#2'), false);
select t.eq('ťuknutí do legu 2', (public.tap_score(:T, :M || '#2',
  '[{"id":"g1","at":"2026-11-12T10:00:00Z","field":"ga","delta":1,"max":6}]')).ga, 1::smallint);
select t.as_player(:X);
select t.eq('cizí hráč do legu 2 ne', public.can_write_score(:T, :M || '#2'), false);

rollback;
