/**
 * Číslo stolu v dlaždici kola (19. 11. 2026, *rozhodnutí uživatele*, návrh A s ikonkou 7): velká číslice přes oba
 * řádky zápasu, nad ní drobný stůl v perspektivě (deska, tyče, nohy). Pro čtečky „Stůl N“.
 */
export function TableNo({ n }: { n: number }) {
  return (
    <span className="table-no">
      <svg viewBox="0 0 44 28" aria-hidden="true" focusable="false">
        <path d="M9 4h26l6 11H3z" strokeWidth="2" />
        <path d="M13 4l-4 11M18 4l-2 11M26 4l2 11M31 4l4 11" strokeWidth="1.1" opacity=".7" />
        <path d="M6 15v10M38 15v10M14 15v7M30 15v7" strokeWidth="2" />
      </svg>
      <span className="visually-hidden">Stůl </span>
      <b>{n}</b>
    </span>
  );
}
