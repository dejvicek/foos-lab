import { resolveRange, type LadderRange } from './ladder';
import type { PlayerId, Training } from './types';

/**
 * Posun v pořadí žebříčku od posledního tréninku (20. 11. 2026, *rozhodnutí uživatele*): kolik míst hráč
 * získal (+) nebo ztratil (−) proti stavu před posledním dnem, kdy se do žebříčku něco zapsalo;
 * „new“ = právě se dostal nad čáru. Hráči pod čárou posun nemají.
 */
export type Move = number | 'new';

/** Poslední den v období, kdy byl trénink, který se do žebříčku počítá (`counts`). */
export function lastDay(trainings: Training[], range: LadderRange, today: string, counts: (t: Training) => boolean): string | null {
  const r = resolveRange(range, today);
  let day: string | null = null;
  for (const t of trainings) {
    if ((r.from && t.date < r.from) || (r.to && t.date > r.to) || !counts(t)) continue;
    if (!day || t.date > day) day = t.date;
  }
  return day;
}

/** Tréninky před daným dnem (stav žebříčku před posledním tréninkem). */
export const before = (trainings: Training[], day: string): Training[] => trainings.filter((t) => t.date < day);

/** Posun každého hráče nad čarou: předchozí pořadí → současné. Bez předchozího stavu (null) nic. */
export function rankMoves(prev: PlayerId[] | null, cur: PlayerId[]): Map<PlayerId, Move> {
  const out = new Map<PlayerId, Move>();
  if (!prev) return out;
  cur.forEach((id, i) => {
    const j = prev.indexOf(id);
    out.set(id, j < 0 ? 'new' : j - i);
  });
  return out;
}

/** Trénink má zapsané skóre zápasu. */
export const hasScores = (t: Training): boolean => Object.keys(t.scores ?? {}).length > 0;
