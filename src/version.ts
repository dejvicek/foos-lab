/**
 * Kompatibilita verzí appky. Zvyš o 1, když nová verze nesmí běžet vedle starší:
 *  - změna algoritmu rozpisu (každý telefon si rozpis počítá sám – různé verze by ukazovaly různé sestavy),
 *  - změna databáze nebo jejích funkcí, kterou starší verze neumí.
 * Telefon se starší kompatibilitou pak bez obnovení nepustí dál; běžná nová verze jen nabídne obnovení.
 */
// 2 (11. 11. 2026): vlastní trénink (format 'practice', migrace 26) – starší verze by ho brala jako klasický trénink.
// 3 (11. 11. 2026): 20 pokusů místo 10 a Čistá desítka (migrace 27) – starší verze by s plným počtem 10
//   zapisovaly jinak a výsledky na čas by ukazovala jako počty.
// 4 (18. 11. 2026): simulace ligového kola po legech (BO3 do 6 / BO5 do 5) – starší verze by do legu 1
//   zapisovala sety a formát BO5 by při uložení tréninku smazala.
// 5 (18. 11. 2026): délka kola zápasu z doby gólu (trainings.goal_sec, migrace 30) – starší verze by
//   ukazovala jiné časy a při uložení tréninku doby gólů smazala.
export const COMPAT = 5;
