import type { MatchId, PlayerId, Schedule, Score } from './types';

/** Celé číslo ≥ 0, jinak null (prázdné, záporné, text, desetinné). */
export function parseScoreValue(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export interface StatLine {
  legs: number;
  wins: number;
  gf: number;
  gc: number;
  loss: number;
  lossLegs: number;
  simM: number;
  simW: number;
}

export const emptyStat = (): StatLine => ({ legs: 0, wins: 0, gf: 0, gc: 0, loss: 0, lossLegs: 0, simM: 0, simW: 0 });

export interface StandingRow extends StatLine {
  playerId: PlayerId;
  diff: number;
}

export interface Standings {
  rows: StandingRow[];
  legsDone: number;
  sim: { teamA: number; teamB: number; played: number } | null;
}

/** Řazení PRD 5.5: rozdíl → výhry → góly+ → simW. */
export function compareStat(a: StatLine & { diff: number }, b: StatLine & { diff: number }): number {
  return b.diff - a.diff || b.wins - a.wins || b.gf - a.gf || b.simW - a.simW;
}

/** PRD 5.5: souhrn jednoho tréninku. */
export function computeStandings(
  schedule: Schedule,
  scores: Record<MatchId, Score>,
  attendees: PlayerId[],
): Standings {
  // Přítomní + kdokoli ze zápasů (hráč, který odešel, zůstává se svými zamčenými zápasy).
  const everyone = [...attendees];
  for (const m of schedule.matches) for (const p of [...m.sideA, ...m.sideB]) if (!everyone.includes(p)) everyone.push(p);
  const stats = new Map<PlayerId, StatLine>(everyone.map((p) => [p, emptyStat()]));
  let legsDone = 0;
  const sim = { teamA: 0, teamB: 0, played: 0 };

  for (const m of schedule.matches) {
    const s = scores[m.id];
    if (!s) continue;
    const ga = parseScoreValue(s.ga);
    const gb = parseScoreValue(s.gb);
    if (ga === null || gb === null) continue;
    const la = parseScoreValue(s.la);
    const lb = parseScoreValue(s.lb);

    const add = (players: PlayerId[], gf: number, gc: number, l: number | null) => {
      for (const p of players) {
        const x = stats.get(p);
        if (!x) continue;
        if (m.block === 'sim') {
          x.simM++;
          if (gf > gc) x.simW++;
        } else {
          x.legs++;
          x.gf += gf;
          x.gc += gc;
          if (gf > gc) x.wins++;
          if (l !== null) {
            x.loss += l;
            x.lossLegs++;
          }
        }
      }
    };
    add(m.sideA, ga, gb, la);
    add(m.sideB, gb, ga, lb);

    if (m.block === 'sim') {
      sim.played++;
      if (ga > gb) sim.teamA++;
      else if (gb > ga) sim.teamB++;
    } else {
      legsDone++;
    }
  }

  const rows: StandingRow[] = everyone.map((p) => {
    const x = stats.get(p)!;
    return { playerId: p, ...x, diff: x.gf - x.gc };
  });
  rows.sort(compareStat); // Array.prototype.sort je stabilní → shoda = pořadí přítomných

  return { rows, legsDone, sim: schedule.mode === 'team' ? sim : null };
}
