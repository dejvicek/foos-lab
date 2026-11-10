-- Migrace 24: nové cvičení nepotřebuje migraci – metrika je libovolný neprázdný text.
begin;
select t.seed();
insert into public.solo_results (training_id, player_id, metric, round, value)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'novaMetrika', 1, 4);
select t.eq('nová metrika jde zapsat', (select value from public.solo_results where metric = 'novaMetrika'), 4::smallint);
select t.fails('prázdná metrika ne',
  $q$insert into public.solo_results (training_id, player_id, metric, round, value) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', '', 1, 4)$q$, '23514');
rollback;
