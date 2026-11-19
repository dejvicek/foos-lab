-- Migrace 31: připravenost (ready_item, can_mark_ready).
begin;
select t.seed();
\set T '''20000000-0000-0000-0000-000000000001'''
\set ORG '''10000000-0000-0000-0000-000000000002'''
\set A '''10000000-0000-0000-0000-000000000003'''
\set B '''10000000-0000-0000-0000-000000000004'''
\set X '''10000000-0000-0000-0000-000000000005'''
\set M '''league|1|1|10000000-0000-0000-0000-000000000003v10000000-0000-0000-0000-000000000004'''
\set D '''drill|Kolo 2|1|10000000-0000-0000-0000-000000000003+10000000-0000-0000-0000-000000000004'''

-- X je rozhodčí zápasu M (zamčené kolo) a je mezi přítomnými.
update public.trainings set attendees = attendees || :X::uuid,
  locked_rounds = jsonb_build_array(jsonb_build_object('discipline', 'normal', 'rows', jsonb_build_array(
    jsonb_build_object('cells', jsonb_build_array(jsonb_build_object('type', 'match', 'match', jsonb_build_object(
      'id', 'league|1|1|10000000-0000-0000-0000-000000000003v10000000-0000-0000-0000-000000000004',
      'referee', '10000000-0000-0000-0000-000000000005'))))))) where id = :T;

set local role authenticated;
select t.as_player(:A);
select t.eq('strana A připravena, utkání ještě nezačalo',
  (select (r.ready ? 'A') and r.started_at is null from public.ready_item(:T, :M, 'A', true, array['A', 'B'], '2026-11-18T10:00:10Z') r), true);
select t.fails('hráč A nehlásí stranu B', $q$select public.ready_item('20000000-0000-0000-0000-000000000001',
  'league|1|1|10000000-0000-0000-0000-000000000003v10000000-0000-0000-0000-000000000004', 'B', true, array['A', 'B'], now())$q$, '42501');
select t.eq('opakování nemění čas první připravenosti',
  (select (r.ready ->> 'A')::timestamptz from public.ready_item(:T, :M, 'A', true, array['A', 'B'], '2026-11-18T10:00:50Z') r), '2026-11-18T10:00:10Z'::timestamptz);

select t.as_player(:B);
select t.eq('obě strany připravené → začátek = poslední připravenost',
  (select r.started_at from public.ready_item(:T, :M, 'B', true, array['A', 'B'], '2026-11-18T10:01:10Z') r), '2026-11-18T10:01:10Z'::timestamptz);
select t.eq('po zahájení se nic nemění (ani zrušení)',
  (select r.ready ? 'B' from public.ready_item(:T, :M, 'B', false, array['A', 'B'], now()) r), true);

-- rozhodčí kteroukoli stranu; zrušení před zahájením
select t.as_player(:X);
select t.eq('rozhodčí hlásí stranu (zahájené utkání se nemění)', (select r.ready ? 'A' from public.ready_item(:T, :M, 'A', true, array['A', 'B'], now()) r), true);
select t.eq('rozhodčí smí jen svůj zápas', public.can_mark_ready(:T, 'league|1|2|10000000-0000-0000-0000-000000000003v10000000-0000-0000-0000-000000000004', 'A'), false);
select t.eq('rozhodčí smí svůj zápas', public.can_mark_ready(:T, :M, 'B'), true);

-- cvičení: hráč za sebe
select t.as_player(:A);
select t.eq('cvičení: za sebe', (select r.ready ? :A from public.ready_item(:T, :D, :A, true, array[:A, :B], now()) r), true);
select t.fails('cvičení: za jiného ne', $q$select public.ready_item('20000000-0000-0000-0000-000000000001',
  'drill|Kolo 2|1|10000000-0000-0000-0000-000000000003+10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000004', true, array['x'], now())$q$, '42501');
select t.eq('zrušení před zahájením', (select r.ready is null from public.ready_item(:T, :D, :A, false, array[:A, :B], now()) r), true);

-- organizátor (zakladatel) cokoli; cizí hráč nic
select t.as_player(:ORG);
select t.eq('organizátor za hráče cvičení', public.can_mark_ready(:T, :D, :B), true);
select t.as_player(:X);
select t.eq('hráč mimo skupinu cvičení nehlásí', public.can_mark_ready(:T, :D, :X), false);

rollback;
