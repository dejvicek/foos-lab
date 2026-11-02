-- Migrace 11: vlastní pauzy konfigurovatelného tréninku (kolik, kde, jak dlouhé).
-- [{"after": 4, "min": 10}, …] = pauza po kole 4, 10 min; null = automaticky 10 min po každé hodině.
-- Dá se spustit opakovaně.

alter table public.trainings add column if not exists breaks jsonb;
