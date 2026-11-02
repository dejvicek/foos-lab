import { pairKey } from './pairing';
import type { PlayerId, Schedule } from './types';

/** Kontrola spravedlnosti rozpisu (jen pro admina): kdo s kým kolikrát hrál ve dvojici a proti sobě. */
export interface Fairness {
  together(a: PlayerId, b: PlayerId): number;
  against(a: PlayerId, b: PlayerId): number;
  /** Zápasy hráče (bez simulace). */
  games: Map<PlayerId, number>;
  /** Kola zápasů, kdy byl mimo stůl (čekal / rozhodoval). */
  sits: Map<PlayerId, number>;
  maxTogether: number;
  maxAgainst: number;
}

/** Počítá zápasy rozpisu mimo simulaci (ta má pevné týmy). */
export function fairness(s: Schedule, players: PlayerId[]): Fairness {
  const together = new Map<string, number>();
  const against = new Map<string, number>();
  const games = new Map<PlayerId, number>(players.map((p) => [p, 0]));
  const sits = new Map<PlayerId, number>(players.map((p) => [p, 0]));
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const match of s.matches) {
    if (match.block === 'sim') continue;
    for (const side of [match.sideA, match.sideB])
      for (let i = 0; i < side.length; i++) for (let j = i + 1; j < side.length; j++) inc(together, pairKey(side[i], side[j]));
    for (const a of match.sideA) for (const b of match.sideB) inc(against, pairKey(a, b));
    for (const p of [...match.sideA, ...match.sideB]) games.set(p, (games.get(p) ?? 0) + 1);
  }
  for (const sec of s.sections) {
    if (sec.id === 'sim') continue;
    for (const row of sec.rows) if (row.kind === 'matches') for (const p of row.waiting) sits.set(p, (sits.get(p) ?? 0) + 1);
  }
  return {
    together: (a, b) => together.get(pairKey(a, b)) ?? 0,
    against: (a, b) => against.get(pairKey(a, b)) ?? 0,
    games,
    sits,
    maxTogether: Math.max(0, ...together.values()),
    maxAgainst: Math.max(0, ...against.values()),
  };
}
