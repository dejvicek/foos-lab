/**
 * Číslo stolu v dlaždici kola (19. 11. 2026, *rozhodnutí uživatele*): velká číslice přes oba řádky zápasu,
 * bez ikonky stolu. Pro čtečky „Stůl N“.
 */
export function TableNo({ n }: { n: number }) {
  return (
    <span className="table-no">
      <span className="visually-hidden">Stůl </span>
      <b>{n}</b>
    </span>
  );
}
