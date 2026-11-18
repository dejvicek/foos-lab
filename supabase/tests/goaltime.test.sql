-- Migrace 30: trainings.goal_sec přes save_training (založení i úprava), null zůstane null.
begin;
select t.seed();
\set ORG '''10000000-0000-0000-0000-000000000002'''

set local role authenticated;
select t.as_player(:ORG);
select t.eq('nový trénink uloží doby gólů', (public.save_training(jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000004', 'date', '2026-11-18', 'mode', 'team', 'tables', 2,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000003'), 'created_by', '10000000-0000-0000-0000-000000000002',
  'format', 'custom', 'duration_min', 120, 'plan', '{"normal": 1}'::jsonb,
  'goal_sec', '{"normal": 37, "sim": 37}'::jsonb), null)).goal_sec ->> 'normal', '37');
select t.eq('úprava dobu gólu změní', (public.save_training(jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000004', 'date', '2026-11-18', 'mode', 'team', 'tables', 2,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000003'), 'created_by', '10000000-0000-0000-0000-000000000002',
  'format', 'custom', 'duration_min', 120, 'plan', '{"normal": 1}'::jsonb,
  'goal_sec', '{"normal": 30}'::jsonb), 1)).goal_sec ->> 'normal', '30');
select t.eq('trénink bez doby gólu ji nemá', (public.save_training(jsonb_build_object(
  'id', '20000000-0000-0000-0000-000000000005', 'date', '2026-11-18', 'mode', 'team', 'tables', 2,
  'attendees', jsonb_build_array('10000000-0000-0000-0000-000000000003'), 'created_by', '10000000-0000-0000-0000-000000000002',
  'format', 'custom', 'duration_min', 120, 'plan', '{"normal": 1}'::jsonb), null)).goal_sec is null, true);

rollback;
