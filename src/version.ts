/**
 * Kompatibilita verzí appky. Zvyš o 1, když nová verze nesmí běžet vedle starší:
 *  - změna algoritmu rozpisu (každý telefon si rozpis počítá sám – různé verze by ukazovaly různé sestavy),
 *  - změna databáze nebo jejích funkcí, kterou starší verze neumí.
 * Telefon se starší kompatibilitou pak bez obnovení nepustí dál; běžná nová verze jen nabídne obnovení.
 */
export const COMPAT = 1;
