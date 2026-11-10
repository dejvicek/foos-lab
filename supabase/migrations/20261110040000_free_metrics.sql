-- Migrace 24 (10. 11. 2026): nové cvičení už nepotřebuje migraci.
-- Seznam povolených metrik v databázi se musel rozšiřovat s každým novým cvičením (migrace 16 a 17);
-- metriky určuje katalog disciplín v appce. Databáze dál hlídá jen to, že metrika není prázdná.
-- Dá se spustit opakovaně.

alter table public.solo_results drop constraint if exists solo_results_metric_check;
alter table public.solo_results add constraint solo_results_metric_check check (length(trim(metric)) > 0);
