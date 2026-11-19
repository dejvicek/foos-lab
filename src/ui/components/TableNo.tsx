/**
 * Číslo stolu v dlaždici kola (19. 11. 2026, *rozhodnutí uživatele*): velká číslice přes oba řádky zápasu,
 * bez ikonky stolu. Pro čtečky „Stůl N“.
 */
/** `mine`: u tohoto stolu hraju / rozhoduju → číslo zlatě (19. 11. 2026); ostatní v barvě textu. */
export function TableNo({ n, mine = false }: { n: number; mine?: boolean }) {
  return (
    <span className={mine ? 'table-no mine' : 'table-no'}>
      <span className="visually-hidden">Stůl </span>
      <b>{n}</b>
    </span>
  );
}
