import type { Move } from '../../domain/moves';

/**
 * Pořadí v žebříčcích: první tři dostanou medaili (zlatá / stříbrná / bronzová),
 * první Zdržovač červený kroužek, šneka a „Brzdu“ (od 18. 11. 2026 jen jeden, dřív první tři). Neřazení hráči („Málo dat“) mají pomlčku.
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

/** Od jakého průměrného čekání na utkání dostane první Zdržovač šneka a Brzdu (20. 11. 2026, *rozhodnutí uživatele*). */
export const SHAME_MIN_WAIT_MS = 2 * 60_000;

/** Zdržovač na čele (jen první, 18. 11. 2026) a jen s průměrným čekáním aspoň 2 min (20. 11. 2026). */
export const isShamed = (place: number, waitAvgMs: number, ranked = true) => ranked && place === 1 && waitAvgMs >= SHAME_MIN_WAIT_MS;

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

const ze = (n: number) => (n >= 2 && n <= 4 ? 'ze' : 'z');

/** Neřazený hráč: tečky postupu k pořadí (●●○ = 2 ze 3 tréninků). */
export function Progress({ have, need }: { have: number; need: number }) {
  const text = `${have} ${ze(need)} ${need} tréninků`;
  return (
    <span className="progress" title={text}>
      {Array.from({ length: need }, (_, i) => (
        <i key={i} className={i < have ? 'on' : undefined} />
      ))}
      <span className="visually-hidden">{text}</span>
    </span>
  );
}

const mist = (n: number) => (n === 1 ? 'místo' : n >= 2 && n <= 4 ? 'místa' : 'míst');

/**
 * Posun v pořadí po posledním tréninku (20. 11. 2026): ▲2 zeleně, ▼1 červeně; kdo se právě dostal nad čáru,
 * štítek nemá (dřív „nový“, zrušeno 20. 11. 2026, *rozhodnutí uživatele*). `since` = den posledního tréninku („12. 11.“).
 */
export function MoveTag({ move, since }: { move: Move | undefined; since: string | null }) {
  if (move === undefined || move === 0 || move === 'new' || !since) return null;
  const n = Math.abs(move);
  const text = `O ${n} ${mist(n)} ${move > 0 ? 'výš' : 'níž'} po tréninku ${since}`;
  return (
    <span className={move > 0 ? 'move up' : 'move down'} title={text}>
      <span aria-hidden="true">{move > 0 ? '▲' : '▼'}</span>
      {n}
      <span className="visually-hidden">{text}</span>
    </span>
  );
}

/** Pořadí v buňce: medaile / číslo a posun. */
export function RankCell({ place, move, since }: { place: number; move?: Move; since: string | null }) {
  return (
    <span className="rank-cell">
      <Medal place={place} />
      <MoveTag move={move} since={since} />
    </span>
  );
}
