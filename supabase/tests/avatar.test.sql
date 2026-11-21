-- Migrace 33: profilová fotka (players.avatar, set_avatar).
begin;
select t.seed();
\set ADM '''10000000-0000-0000-0000-000000000001'''
\set A '''10000000-0000-0000-0000-000000000003'''
\set B '''10000000-0000-0000-0000-000000000004'''
\set IMG '''data:image/webp;base64,UklGRg=='''

update public.players set updated_at = '2026-01-01' where id = :A;

set local role authenticated;
select t.as_player(:A);
select public.set_avatar(:A, :IMG);
select t.eq('hráč si nastaví svou fotku', (select avatar from public.players where id = :A), 'data:image/webp;base64,UklGRg==');
select t.eq('změna posune updated_at (dorazí přes changes_since)', (select updated_at > '2026-01-02' from public.players where id = :A), true);
select public.set_avatar(:A, :IMG);
select t.eq('opakování dá stejný výsledek', (select avatar from public.players where id = :A), 'data:image/webp;base64,UklGRg==');
select public.set_avatar(:A, 'data:image/jpeg;base64,/9j/');
select t.eq('JPEG je povolený', (select avatar from public.players where id = :A), 'data:image/jpeg;base64,/9j/');
select t.fails('cizímu hráči ne', $q$select public.set_avatar('10000000-0000-0000-0000-000000000004', 'data:image/webp;base64,AA==')$q$, '42501');
select t.fails('PNG ne', $q$select public.set_avatar('10000000-0000-0000-0000-000000000003', 'data:image/png;base64,AA==')$q$, '22023');
select t.fails('jiný text ne', $q$select public.set_avatar('10000000-0000-0000-0000-000000000003', 'https://example.com/a.webp')$q$, '22023');
select t.fails('příliš velký obrázek ne', $q$select public.set_avatar('10000000-0000-0000-0000-000000000003',
  'data:image/webp;base64,' || repeat('A', 20001 - length('data:image/webp;base64,')))$q$, '22023');
select public.set_avatar(:A, 'data:image/webp;base64,' || repeat('A', 20000 - length('data:image/webp;base64,')));
select t.eq('právě na limitu projde', (select length(avatar) from public.players where id = :A), 20000);
select public.set_avatar(:A, null);
select t.eq('null fotku smaže', (select avatar from public.players where id = :A), null::text);

select t.as_player(:ADM);
select public.set_avatar(:B, :IMG);
select t.eq('admin nastaví fotku komukoli', (select avatar from public.players where id = :B), 'data:image/webp;base64,UklGRg==');
select public.set_avatar(:B, null);
select t.eq('admin fotku smaže', (select avatar from public.players where id = :B), null::text);

rollback;
