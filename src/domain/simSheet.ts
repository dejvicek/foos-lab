import { matchState } from './matchFormat';
import { setScores } from './legState';
import { parseScoreValue } from './standings';
import type { Match, MatchId, PlayerId, Schedule, Score } from './types';

/**
 * Simulace kola jako ligový zápis (19. 11. 2026, *rozhodnutí uživatele*): domácí = tým A, hosté = tým B,
 * řádek na zápas v pořadí rozpisu (vlna, stůl), Body = vyhraný zápas, Hry = vyhrané legy (starší simulace sety).
 * Sestava jako v lize: tým A písmena A, B, C …, tým B čísla 1, 2, 3 … podle nominačního pořadí.
 */
export interface SimSheetRow {
  no: number;
  wave: number;
  kind: Match['kind'];
  sideA: PlayerId[];
  sideB: PlayerId[];
  state: 'done' | 'playing' | 'waiting';
  /** Body zápasu 1:0 / 0:1 (jen dohraný). */
  points: [number, number] | null;
  /** Vyhrané legy (sety); u rozehraného zatím. */
  games: [number, number] | null;
  /** Skóre legů v pořadí; poslední u rozehraného běží. */
  legs: [number, number][];
  /** Průběžné body týmů po dohraném zápase. */
  running: [number, number] | null;
}

export interface SimSheet {
  teamA: { id: PlayerId; code: string }[];
  teamB: { id: PlayerId; code: string }[];
  rows: SimSheetRow[];
  points: [number, number];
  games: [number, number];
  played: number;
}

const val = (s: Score | undefined): [number, number] | null => {
  const a = parseScoreValue(s?.ga);
  const b = parseScoreValue(s?.gb);
  return a === null || b === null ? null : [a, b];
};

function rowOf(m: Match, scores: Record<MatchId, Score>): Pick<SimSheetRow, 'state' | 'points' | 'games' | 'legs'> {
  if (setScores(m)) {
    // Starší simulace: skóre zápasu = sety, bez legů.
    const v = val(scores[m.id]);
    if (!v) return { state: 'waiting', points: null, games: null, legs: [] };
    return { state: 'done', points: v[0] > v[1] ? [1, 0] : v[1] > v[0] ? [0, 1] : [0, 0], games: v, legs: [] };
  }
  const st = matchState(m, scores);
  const legs = st.legs.flatMap((l) => {
    const v = val(l.score);
    return v ? [v] : [];
  });
  if (st.over) return { state: 'done', points: st.winner === 'A' ? [1, 0] : st.winner === 'B' ? [0, 1] : [0, 0], games: [st.legsA, st.legsB], legs };
  if (!legs.length) return { state: 'waiting', points: null, games: null, legs };
  return { state: 'playing', points: null, games: [st.legsA, st.legsB], legs };
}

export function simSheet(schedule: Schedule, scores: Record<MatchId, Score>, attendees: PlayerId[]): SimSheet | null {
  const sims = schedule.matches.filter((m) => m.block === 'sim').sort((a, b) => a.round - b.round || a.table - b.table);
  if (!sims.length) return null;
  const order = (ids: Set<PlayerId>) => [...attendees.filter((p) => ids.has(p)), ...[...ids].filter((p) => !attendees.includes(p))];
  const teamA = order(new Set(sims.flatMap((m) => m.sideA))).map((id, i) => ({ id, code: String.fromCharCode(65 + i) }));
  const teamB = order(new Set(sims.flatMap((m) => m.sideB))).map((id, i) => ({ id, code: String(i + 1) }));
  const points: [number, number] = [0, 0];
  const games: [number, number] = [0, 0];
  let played = 0;
  const rows = sims.map((m, i): SimSheetRow => {
    const r = rowOf(m, scores);
    if (r.points) {
      points[0] += r.points[0];
      points[1] += r.points[1];
      played++;
    }
    if (r.games) {
      games[0] += r.games[0];
      games[1] += r.games[1];
    }
    return { no: i + 1, wave: m.round, kind: m.kind, sideA: m.sideA, sideB: m.sideB, ...r, running: r.points ? [points[0], points[1]] : null };
  });
  return { teamA, teamB, rows, points, games, played };
}
