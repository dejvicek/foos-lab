-- Migrace 19 (9. 11. 2026): pořadí disciplín v tréninku ze šablony (["normal", "warmupPasses", …]).
-- null = pořadí katalogu (cvičení, zápasy, simulace) – starší tréninky. Dá se spustit opakovaně.

alter table public.trainings add column if not exists discipline_order jsonb;
