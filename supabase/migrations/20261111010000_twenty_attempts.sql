-- Migrace 27 (11. 11. 2026): cvičení mají 20 pokusů místo 10 (Čistá desítka a ostatní cvičení).
-- Výsledek zapsaný číslem neměl v databázi počet pokusů a appka ho brala jako plný počet. Starší takové
-- výsledky jsou z 10, tak se jim počet doplní. Nová appka plný počet (20) zapisuje výslovně, takže
-- prázdné pokusy znamenají jen starší výsledky – dá se spustit opakovaně.
-- Rozehrávka ze zadních tyčí (vyřazená) zůstává po 10, Přihrávky na pětce, Penalta (20 střel) a Řetězec
-- měly 20 už dřív. Funkce databáze se nemění: plný počet posílá appka (tap_drill p_max).

update public.solo_results
   set attempts = 10
 where attempts is null
   and metric in ('passWallLane', 'fiveBarControl', 'fiveBarSolo', 'penaltyKeeper', 'penaltySolo',
                  'backShotKeeper', 'backShotSolo', 'clearing', 'looseBall');
