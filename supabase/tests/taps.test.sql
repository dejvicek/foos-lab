-- Migrace 21: ťuknutí, které jde bezpečně opakovat (tap_score, tap_drill), a zahájení / konec utkání
-- po jednotlivých polích (start_item, end_item).
begin;
select t.seed();

\set T '''20000000-0000-0000-0000-000000000001'''
\set A '''10000000-0000-0000-0000-000000000003'''
\set M '''league|1|1|10000000-0000-0000-0000-000000000003v10000000-0000-0000-0000-000000000004'''
\set D '''drill|Kolo 1|1|10000000-0000-0000-0000-000000000003+10000000-0000-0000-0000-000000000004'''

-- ── tap_score ──────────────────────────────────────────────
select t.as_player(:A);

select t.eq('gól se přičte', (public.tap_score(:T, :M, '[{"id":"e1","at":"2026-11-10T10:00:00Z","field":"ga","delta":1,"max":6}]')).ga, 1::smallint);
select t.eq('soupeř dostane 0', (select gb from public.scores where match_id = :M), 0::smallint);
select t.eq('opakované ťuknutí se nezapočítá podruhé',
  (public.tap_score(:T, :M, '[{"id":"e1","at":"2026-11-10T10:00:00Z","field":"ga","delta":1,"max":6}]')).ga, 1::smallint);
select t.eq('událost je jen jednou', (select count(*) from public.game_events where id = 'e1'), 1::bigint);
select t.eq('událost nese stranu a druh',
  (select kind || side || delta from public.game_events where id = 'e1'), 'goalA1');

-- Daň za ztrátu: ztráta + gól soupeře v jednom volání; opakování celé dávky nic nezmění.
select public.tap_score(:T, :M, '[{"id":"e2","at":"2026-11-10T10:00:05Z","field":"lb","delta":1,"max":30},{"id":"e3","at":"2026-11-10T10:00:05Z","field":"ga","delta":1,"max":6}]');
select public.tap_score(:T, :M, '[{"id":"e2","at":"2026-11-10T10:00:05Z","field":"lb","delta":1,"max":30},{"id":"e3","at":"2026-11-10T10:00:05Z","field":"ga","delta":1,"max":6}]');
select t.eq('dávka: gól', (select ga from public.scores where match_id = :M), 2::smallint);
select t.eq('dávka: ztráta', (select lb from public.scores where match_id = :M), 1::smallint);
select t.eq('dávka: druhá ztráta 0', (select la from public.scores where match_id = :M), 0::smallint);

select t.eq('zpět ubere', (public.tap_score(:T, :M, '[{"id":"e4","field":"ga","delta":-1,"max":6}]')).ga, 1::smallint);
select t.eq('zpět je událost −1', (select delta from public.game_events where id = 'e4'), (-1)::smallint);
select t.eq('strop legu',
  (public.tap_score(:T, :M, '[{"id":"e5","field":"gb","delta":1,"max":1},{"id":"e6","field":"gb","delta":1,"max":1}]')).gb, 1::smallint);

select t.fails('neznámé pole', format('select public.tap_score(%L, %L, %L)', :T, :M, '[{"id":"e7","field":"xx","delta":1,"max":6}]'), '22023');

select t.as_player('10000000-0000-0000-0000-000000000005');
select t.fails('cizí hráč do zápasu nezapíše', format('select public.tap_score(%L, %L, %L)', :T, :M, '[{"id":"e8","field":"ga","delta":1,"max":6}]'), '42501');
select t.eq('odmítnuté ťuknutí nenechá událost', (select count(*) from public.game_events where id = 'e8'), 0::bigint);

-- ── tap_drill ──────────────────────────────────────────────
select t.as_player(:A);

select t.eq('povedený pokus: výsledek', (public.tap_drill(:T, :A, 'penaltySolo', 1::smallint, 3,
  '[{"id":"d1","at":"2026-11-10T10:01:00Z","item":"drill|x","kind":"hit","delta":1,"dvalue":1,"dattempts":1}]')).value, 1::smallint);
select t.eq('opakovaný pokus se nezapočítá podruhé', (public.tap_drill(:T, :A, 'penaltySolo', 1::smallint, 3,
  '[{"id":"d1","at":"2026-11-10T10:01:00Z","item":"drill|x","kind":"hit","delta":1,"dvalue":1,"dattempts":1}]')).attempts, 1::smallint);
select t.eq('nepovedený pokus: jen pokusy', (select value || '/' || attempts from public.tap_drill(:T, :A, 'penaltySolo', 1::smallint, 3,
  '[{"id":"d2","item":"drill|x","kind":"miss","delta":1,"dvalue":0,"dattempts":1}]')), '1/2');
select t.eq('událost pokusu', (select kind || delta || player_id::text from public.game_events where id = 'd2'),
  'miss1' || :A);
-- Třetí pokus je poslední; čtvrtý se nezapíše a nenechá událost.
select t.eq('přes plný počet pokusů ne', (select value || '/' || attempts from public.tap_drill(:T, :A, 'penaltySolo', 1::smallint, 3,
  '[{"id":"d3","item":"drill|x","kind":"hit","delta":1,"dvalue":1,"dattempts":1},{"id":"d4","item":"drill|x","kind":"hit","delta":1,"dvalue":1,"dattempts":1}]')), '2/3');
select t.eq('odmítnutý pokus nenechá událost', (select count(*) from public.game_events where id = 'd4'), 0::bigint);
select t.eq('zpět vrátí povedený pokus', (select value || '/' || attempts from public.tap_drill(:T, :A, 'penaltySolo', 1::smallint, 3,
  '[{"id":"d5","item":"drill|x","kind":"hit","delta":-1,"dvalue":-1,"dattempts":-1}]')), '1/2');

select t.fails('za cizího hráče ne', format('select public.tap_drill(%L, %L, %L, 1::smallint, 3, %L)', :T,
  '10000000-0000-0000-0000-000000000005', 'penaltySolo', '[{"id":"d6","item":"drill|x","kind":"hit","delta":1,"dvalue":1,"dattempts":1}]'), '42501');

-- ── start_item / end_item ──────────────────────────────────
select t.eq('zahájení zapíše čas', (public.start_item(:T, :M, '2026-11-10T10:00:00Z')).started_at, '2026-11-10T10:00:00Z'::timestamptz);
select t.eq('druhé zahájení čas nezmění', (public.start_item(:T, :M, '2026-11-10T10:03:00Z')).started_at, '2026-11-10T10:00:00Z'::timestamptz);
select t.eq('konec zapíše čas', (public.end_item(:T, :M, null, '2026-11-10T10:08:00Z')).ended_at, '2026-11-10T10:08:00Z'::timestamptz);
select t.eq('opožděné zahájení utkání znovu neotevře', (public.start_item(:T, :M, '2026-11-10T10:09:00Z')).ended_at, '2026-11-10T10:08:00Z'::timestamptz);
select t.eq('druhý konec čas nezmění', (public.end_item(:T, :M, null, '2026-11-10T10:20:00Z')).ended_at, '2026-11-10T10:08:00Z'::timestamptz);

-- Konec nezahájeného utkání (organizátor): zahájení se doplní.
select t.as_player('10000000-0000-0000-0000-000000000002');
select t.eq('konec bez zahájení doplní zahájení',
  (select started_at::text || ' ' || ended_at::text from public.end_item(:T, :D, '2026-11-10T10:10:00Z', '2026-11-10T10:12:00Z')),
  '2026-11-10T10:10:00Z'::timestamptz::text || ' ' || '2026-11-10T10:12:00Z'::timestamptz::text);
-- Pauza: „Spustit další kolo“ bez zahájené pauzy.
select t.eq('pauza: jen konec', (select (started_at is null)::text || ' ' || (ended_at is not null)::text from public.end_item(:T, 'pause|0', null, '2026-11-10T10:30:00Z')), 'true true');
-- Čas z budoucnosti (hodiny telefonu napřed) se ořízne na čas serveru.
select t.eq('čas z budoucnosti se ořízne', (public.start_item(:T, 'training', now() + interval '1 hour')).started_at <= now(), true);

select t.as_player('10000000-0000-0000-0000-000000000005');
select t.fails('cizí hráč utkání nezahájí', format('select public.start_item(%L, %L, now())', :T, :M), '42501');
select t.fails('cizí hráč utkání neukončí', format('select public.end_item(%L, %L, null, now())', :T, :M), '42501');

rollback;
