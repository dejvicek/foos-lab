/**
 * Kompatibilita verzí appky. Zvyš o 1, když nová verze nesmí běžet vedle starší:
 *  - změna algoritmu rozpisu (každý telefon si rozpis počítá sám – různé verze by ukazovaly různé sestavy),
 *  - změna databáze nebo jejích funkcí, kterou starší verze neumí.
 * Telefon se starší kompatibilitou pak bez obnovení nepustí dál; běžná nová verze jen nabídne obnovení.
 */
// 2 (11. 11. 2026): vlastní trénink (format 'practice', migrace 26) – starší verze by ho brala jako klasický trénink.
// 3 (11. 11. 2026): 20 pokusů místo 10 a Čistá desítka (migrace 27) – starší verze by s plným počtem 10
//   zapisovaly jinak a výsledky na čas by ukazovala jako počty.
export const COMPAT = 3;
