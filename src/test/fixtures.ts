/** Hráči H1..Hn v nominačním pořadí. */
export const H = (n: number): string[] => Array.from({ length: n }, (_, i) => 'H' + (i + 1));

export const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

import { buildSchedule } from '../domain/schedule';
import type { Mode, PlayerId, TableCount, Training } from '../domain/types';

export function training(
  id: string,
  date: string,
  mode: Mode,
  attendees: PlayerId[],
  tables: TableCount = 4,
): Training {
  return { id, date, startTime: '18:00', mode, tables, attendees, scores: {}, soloResults: {}, simSplit: 'order', simTeams: null, format: 'classic', durationMin: 180, plan: {}, lockedRounds: [] };
}

/**
 * Zapíše výsledky ligových legů, které hraje `player`, v pořadí rozpisu.
 * results[i] = [góly hráčovy strany, góly soupeře].
 */
export function scoreFor(t: Training, player: PlayerId, results: [number, number][]): Training {
  const legs = buildSchedule(t).matches.filter(
    (m) => m.block === 'league' && (m.sideA.includes(player) || m.sideB.includes(player)),
  );
  if (legs.length < results.length) throw new Error(`${player} hraje jen ${legs.length} legů`);
  const scores = { ...t.scores };
  results.forEach(([mine, theirs], i) => {
    const m = legs[i];
    scores[m.id] = m.sideA.includes(player) ? { ga: mine, gb: theirs } : { ga: theirs, gb: mine };
  });
  return { ...t, scores };
}
