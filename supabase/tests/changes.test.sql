-- Migrace 23: changes_since – všechna data jedním dotazem, nebo jen řádky změněné od minula (a smazané).
begin;
select t.seed();
\set T '''20000000-0000-0000-0000-000000000001'''
\set A '''10000000-0000-0000-0000-000000000003'''

insert into public.scores (training_id, match_id, ga, gb) values (:T, 'm1', 1, 0), (:T, 'm2', 2, 2);
insert into public.solo_results (training_id, player_id, metric, round, value) values (:T, :A, 'chain', 0, 3);
insert into public.play_times (training_id, item_id, started_at) values (:T, 'training', now());
insert into public.game_events (id, training_id, item_id, kind, delta) values ('e1', :T, 'm1', 'goal', 1);

set local role authenticated;
select t.as_player(:A);

-- ── Všechno jedním dotazem ─────────────────────────────────
create temp table full_load on commit drop as select public.changes_since(null) as j;
select t.eq('bez kurzoru: kompletní data', (select (j ->> 'full')::boolean from full_load), true);
select t.eq('kompletní: hráči', (select jsonb_array_length(j -> 'players') from full_load), 5);
select t.eq('kompletní: tréninky', (select jsonb_array_length(j -> 'trainings') from full_load), 1);
select t.eq('kompletní: skóre', (select jsonb_array_length(j -> 'scores') from full_load), 2);
select t.eq('kompletní: výsledky cvičení', (select jsonb_array_length(j -> 'solo_results') from full_load), 1);
select t.eq('kompletní: časy utkání', (select jsonb_array_length(j -> 'play_times') from full_load), 1);
select t.eq('kompletní: katalog', (select j -> 'catalog' from full_load), '{}'::jsonb);
select t.eq('kompletní: nic smazaného', (select jsonb_array_length(j -> 'deleted') from full_load), 0);
select t.eq('průběh her se neposílá', (select j ? 'game_events' from full_load), false);
select t.eq('vrací kurzor pro příště', (select (j ->> 'cursor')::timestamptz is not null from full_load), true);

-- ── Jen změny ──────────────────────────────────────────────
-- Kurzor „za chvíli“: nic z dosavadního se změněné nejeví (v testu běží vše v jedné transakci,
-- čas zápisu se proto posouvá ručně).
reset role;
update public.scores set ga = 5 where match_id = 'm1';
delete from public.scores where match_id = 'm2';
set local session_replication_role = replica; -- bez triggerů: čas změny posunout ručně
update public.scores set updated_at = now() + interval '10 minutes' where match_id = 'm1';
update public.deleted_rows set deleted_at = now() + interval '10 minutes';
set local session_replication_role = origin;
set local role authenticated;

create temp table delta on commit drop as select public.changes_since(now() + interval '5 minutes') as j;
select t.eq('s kurzorem: jen změny', (select (j ->> 'full')::boolean from delta), false);
select t.eq('změněné skóre je ve změnách', (select j -> 'scores' -> 0 ->> 'match_id' from delta), 'm1');
select t.eq('jen to jedno skóre', (select jsonb_array_length(j -> 'scores') from delta), 1);
select t.eq('nezměněný trénink se neposílá', (select jsonb_array_length(j -> 'trainings') from delta), 0);
select t.eq('nezměnění hráči se neposílají', (select jsonb_array_length(j -> 'players') from delta), 0);
select t.eq('nezměněný katalog se neposílá', (select j -> 'catalog' from delta), 'null'::jsonb);
select t.eq('smazané skóre je mezi smazanými',
  (select j -> 'deleted' from delta),
  jsonb_build_array(jsonb_build_object('tbl', 'scores', 'key', jsonb_build_object('training_id', '20000000-0000-0000-0000-000000000001', 'match_id', 'm2'))));

-- Čas změny určuje server, ne telefon (hodiny telefonu mohou jít špatně).
reset role;
update public.scores set ga = 6, updated_at = '2001-01-01' where match_id = 'm1';
select t.eq('updated_at nastavuje server', (select updated_at >= now() from public.scores where match_id = 'm1'), true);
update public.trainings set tables = 3 where id = :T;
select t.eq('trénink má čas změny', (select updated_at >= now() from public.trainings where id = :T), true);
update public.players set name = 'Hrac A2' where id = :A;
select t.eq('hráč má čas změny', (select updated_at >= now() from public.players where id = :A), true);

-- Smazaný trénink: záznam o tréninku i o jeho řádcích; smazaný hráč.
delete from public.trainings where id = :T;
select t.eq('smazaný trénink je zaznamenaný', (select count(*) from public.deleted_rows where tbl = 'trainings' and key ->> 'id' = '20000000-0000-0000-0000-000000000001'), 1::bigint);
select t.eq('i jeho výsledky cvičení', (select count(*) from public.deleted_rows where tbl = 'solo_results'), 1::bigint);
select t.eq('i jeho časy utkání', (select count(*) from public.deleted_rows where tbl = 'play_times'), 1::bigint);
delete from public.players where id = '10000000-0000-0000-0000-000000000005';
select t.eq('smazaný hráč je zaznamenaný', (select key from public.deleted_rows where tbl = 'players'), jsonb_build_object('id', '10000000-0000-0000-0000-000000000005'));

-- Příliš starý kurzor (záznamy o smazání už nemusí existovat) → kompletní data.
set local role authenticated;
select t.eq('starý kurzor: kompletní data', (public.changes_since(now() - interval '100 days') ->> 'full')::boolean, true);

-- Účet bez hráče nedostane nic.
reset role;
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000009', 'bez-hrace@test');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000009', true);
select t.eq('účet bez hráče: žádní hráči', jsonb_array_length(public.changes_since(null) -> 'players'), 0);
select t.eq('účet bez hráče: nic smazaného nevidí', jsonb_array_length(public.changes_since(now() - interval '1 day') -> 'deleted'), 0);

rollback;
