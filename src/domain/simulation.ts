import type { Pairing } from './assign';
import type { PlayerId, SimTeams } from './types';

export interface Wave {
  matches: Pairing[];
  doubles: number;
  singles: number;
  restA: PlayerId[];
  restB: PlayerId[];
}

/**
 * PRD 5.3: jedna vlna simulace. Ve 2. vlně (prevDoubles != null) nejdřív
 * s singlů (~ polovina dvojic z 1. vlny), pak dvojice, pak singly ze zbytku.
 */
export function wave(A: PlayerId[], B: PlayerId[], tables: number, prevDoubles: number | null): Wave {
  const matches: Pairing[] = [];
  let ai = 0;
  let bi = 0;
  let doubles = 0;
  let singles = 0;
  if (prevDoubles !== null) {
    const s = Math.min(Math.max(1, Math.ceil(prevDoubles / 2)), A.length, B.length, tables);
    for (let k = 0; k < s; k++) {
      matches.push({ kind: 'singles', a: [A[ai++]], b: [B[bi++]] });
      singles++;
    }
  }
  while (A.length - ai >= 2 && B.length - bi >= 2 && matches.length < tables) {
    matches.push({ kind: 'doubles', a: [A[ai], A[ai + 1]], b: [B[bi], B[bi + 1]] });
    ai += 2;
    bi += 2;
    doubles++;
  }
  while (A.length - ai >= 1 && B.length - bi >= 1 && matches.length < tables) {
    matches.push({ kind: 'singles', a: [A[ai++]], b: [B[bi++]] });
    singles++;
  }
  return { matches, doubles, singles, restA: A.slice(ai), restB: B.slice(bi) };
}

/** Tým A = prvních ceil(n/2) hráčů v nominačním pořadí, B = zbytek. Dvě vlny. */
export function buildSimulation(players: PlayerId[], tables: number) {
  const half = Math.ceil(players.length / 2);
  return simulateTeams(players.slice(0, half), players.slice(half), tables);
}

/**
 * Vyrovnané týmy z pořadí podle výkonu: 1. do A, 2.–3. do B, 4.–5. do A, …
 * Uvnitř týmu zůstává pořadí podle výkonu (silnější dřív do singlu).
 */
export function balancedSplit(ranked: PlayerId[]): { A: PlayerId[]; B: PlayerId[] } {
  const A: PlayerId[] = [];
  const B: PlayerId[] = [];
  ranked.forEach((p, i) => (i % 4 === 0 || i % 4 === 3 ? A : B).push(p));
  return { A, B };
}

/** Dvě vlny simulace pro dané týmy (PRD 5.3). */
export function simulateTeams(A: PlayerId[], B: PlayerId[], tables: number) {
  const wave1 = wave(A, B, tables, null);
  const A2 = wave1.restA.concat(A.filter((p) => !wave1.restA.includes(p)));
  const B2 = wave1.restB.concat(B.filter((p) => !wave1.restB.includes(p)));
  const wave2 = wave(A2, B2, tables, wave1.doubles);
  return { A, B, wave1, wave2 };
}

/** Ruční týmy po změně přítomných: odchozí vypadnou, noví se přidají do menšího týmu (při shodě do A). */
export function reconcileTeams(teams: { A: PlayerId[]; B: PlayerId[] }, attendees: PlayerId[]): { A: PlayerId[]; B: PlayerId[] } {
  const present = new Set(attendees);
  const A = teams.A.filter((p) => present.has(p));
  const B = teams.B.filter((p) => present.has(p));
  const placed = new Set([...A, ...B]);
  for (const p of attendees) if (!placed.has(p)) (B.length < A.length ? B : A).push(p);
  return { A, B };
}

/**
 * Ruční týmy „Náhodně“: zamíchá hráče obou týmů (Fisher–Yates) a rozdělí je ve stejných velikostech.
 * Generátor dodává UI – doména zůstává deterministická.
 */
export function randomTeams(teams: SimTeams, rand: () => number): SimTeams {
  const all = [...teams.A, ...teams.B];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return { A: all.slice(0, teams.A.length), B: all.slice(teams.A.length) };
}
