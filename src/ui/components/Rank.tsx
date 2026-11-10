/**
 * Pořadí v žebříčcích: první tři dostanou medaili (zlatá / stříbrná / bronzová),
 * první tři Zdržovači červený kroužek a šneka (10. 11. 2026). Neřazení hráči („Málo dat“) mají pomlčku.
 */

const PODIUM = 3;

/** Pořadí bez medaile: tečka mimo centrování, aby číslice seděla pod středem medaile. */
const Plain = ({ place }: { place: number }) => (
  <span className="rank-n">
    {place}
    <span className="rank-dot">.</span>
  </span>
);

/** Třída řádku pro první tři (podbarvení prvního místa). */
export const podiumRow = (place: number, ranked = true) => (ranked && place === 1 ? 'top-1' : undefined);

export function Medal({ place, ranked = true }: { place: number; ranked?: boolean }) {
  if (!ranked) return <>–</>;
  if (place > PODIUM) return <Plain place={place} />;
  return (
    <span className={`medal m${place}`} title={`${place}. místo`}>
      {place}
      <span className="visually-hidden">. místo</span>
    </span>
  );
}

/** Zdržovač na čele: jen když opravdu čekal (čekání > 0). */
export const isShamed = (place: number, waited: boolean) => waited && place <= PODIUM;

export function ShameRank({ place, shamed }: { place: number; shamed: boolean }) {
  if (!shamed) return <Plain place={place} />;
  return (
    <span className="shame-rank" title={`${place}. nejdelší čekání`}>
      {place}
      <span className="visually-hidden">. nejdelší čekání</span>
    </span>
  );
}

export function Snail({ big = false }: { big?: boolean }) {
  return (
    <svg className={big ? 'snail big' : 'snail'} viewBox="0 0 25 16" aria-hidden="true" focusable="false">
      <path className="snail-body" d="M1 15c0-1.3 1.2-2 3-2h13c1.4 0 2.2-.9 2.5-2.4l.4-2.1c.3-1 1.7-1 2 0l-.2 3.6C21.4 14 20 15 17.5 15z" />
      <circle className="snail-shell" cx="10" cy="7.5" r="5.5" />
      <path d="M10 7.5a1.1 1.1 0 0 1 1.1 1.1a2.2 2.2 0 0 1-2.2 2.2a3.3 3.3 0 0 1-3.3-3.3a4.4 4.4 0 0 1 4.4-4.4" />
      <path d="M20.7 8.2l-1.4-4.6M21.4 8.4l1.4-4.1" />
      <circle className="snail-eye" cx="19.2" cy="3.3" r="1" />
      <circle className="snail-eye" cx="22.8" cy="4.2" r="1" />
    </svg>
  );
}
