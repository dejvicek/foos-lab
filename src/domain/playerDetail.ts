import { isPractice, ladderMatches, type MatchKindFilter } from './practice';
import { parseSoloKey, soloMetric } from './solo';
import { clubMetric, sourceSolo } from './soloLadder';
import type { DisciplineId, MatchId, PlayerId, SoloKey, SoloMetric, Training } from './types';

/**
 * Výsledky hráče v jedné disciplíně po trénincích (20. 11. 2026, *rozhodnutí uživatele*): klik na jméno v tabulce
 * zápasů podle disciplín nebo cvičení ukáže, jak se mu v ní dařilo trénink po tréninku. Počítá stejně jako
 * žebříček (computeMatchLadder / computeSoloLadder), jen rozepsané.
 */

const inRange = (t: Training, from: string | null, to: string | null) => !((from && t.date < from) || (to && t.date > to));
const newestFirst = (a: Training, b: Training) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.startTime < b.startTime ? 1 : a.startTime > b.startTime ? -1 : 0);

export interface PlayerMatch {
  matchId: MatchId;
  round: number;
  /** Spoluhráč (čtyřhra). */
  partners: PlayerId[];
  opponents: PlayerId[];
  /** Zapsané legy ze strany hráče; `over` = dohraný leg. */
  legs: { gf: number; gc: number; over: boolean }[];
  /** null = zápas není dohraný. */
  result: 'win' | 'loss' | 'draw' | null;
}

export interface PlayerMatchTraining {
  trainingId: string;
  date: string;
  practice: boolean;
  matches: PlayerMatch[];
  /** Dohrané zápasy (remíza BO2 se nepočítá ani do jednoho). */
  wins: number;
  losses: number;
  /** Dohrané legy a jejich góly. */
  legWins: number;
  legLosses: number;
  gf: number;
  gc: number;
}

export function playerMatchHistory(
  trainings: Training[],
  playerId: PlayerId,
  discipline: DisciplineId,
  from: string | null,
  to: string | null,
  kind: MatchKindFilter = 'all',
): PlayerMatchTraining[] {
  const out: PlayerMatchTraining[] = [];
  for (const t of [...trainings].sort(newestFirst)) {
    if (!inRange(t, from, to)) continue;
    const row: PlayerMatchTraining = { trainingId: t.id, date: t.date, practice: isPractice(t), matches: [], wins: 0, losses: 0, legWins: 0, legLosses: 0, gf: 0, gc: 0 };
    for (const { discipline: id, match, state } of ladderMatches(t)) {
      if (id !== discipline || (kind !== 'all' && match.kind !== kind)) continue;
      const side = match.sideA.includes(playerId) ? 'A' : match.sideB.includes(playerId) ? 'B' : null;
      if (!side) continue;
      const mine = side === 'A' ? match.sideA : match.sideB;
      const legs = state.legs
        .filter((l) => l.score?.ga !== undefined && l.score?.gb !== undefined)
        .map((l) => {
          const [a, b] = [l.score!.ga ?? 0, l.score!.gb ?? 0];
          return { gf: side === 'A' ? a : b, gc: side === 'A' ? b : a, over: l.over, won: l.winner === side };
        });
      for (const l of legs) {
        if (!l.over) continue;
        if (l.won) row.legWins++;
        else row.legLosses++;
        row.gf += l.gf;
        row.gc += l.gc;
      }
      const result = !state.over ? null : state.winner === side ? 'win' : state.winner === null ? 'draw' : 'loss';
      if (result === 'win') row.wins++;
      if (result === 'loss') row.losses++;
      row.matches.push({
        matchId: match.id,
        round: match.round,
        partners: mine.filter((p) => p !== playerId),
        opponents: side === 'A' ? match.sideB : match.sideA,
        legs: legs.map(({ gf, gc, over }) => ({ gf, gc, over })),
        result,
      });
    }
    if (row.matches.length) out.push(row);
  }
  return out;
}

export interface PlayerDrillTraining {
  trainingId: string;
  date: string;
  practice: boolean;
  /** Série / kola cvičení v tréninku: výsledek a z kolika pokusů (u Čisté desítky sekundy, 0 = nesplněno). */
  values: { key: SoloKey; value: number; possible: number }[];
  /** Součet a možné maximum (Čistá desítka: splněné / všechny série). */
  sum: number;
  possible: number;
  /** Čistá desítka: nejlepší čas; null = nesplněno nebo jiné cvičení. */
  best: number | null;
}

export function playerDrillHistory(trainings: Training[], playerId: PlayerId, metric: SoloMetric, from: string | null, to: string | null): PlayerDrillTraining[] {
  const def = soloMetric(metric);
  const source = clubMetric(metric) ? 'club' : 'practice';
  const out: PlayerDrillTraining[] = [];
  for (const t of [...trainings].sort(newestFirst)) {
    if (!inRange(t, from, to)) continue;
    const mine = sourceSolo(t, source)[playerId] ?? {};
    const values = Object.entries(mine)
      .filter(([k, v]) => parseSoloKey(k).metric === metric && v !== undefined && v !== null)
      .map(([k, v]) => ({ key: k as SoloKey, value: v, possible: def.streak ? 1 : (t.soloAttempts?.[playerId]?.[k] ?? def.max) }))
      .sort((a, b) => parseSoloKey(a.key).round - parseSoloKey(b.key).round);
    if (!values.length) continue;
    const done = values.filter((v) => v.value > 0).map((v) => v.value);
    out.push({
      trainingId: t.id,
      date: t.date,
      practice: isPractice(t),
      values,
      sum: def.streak ? done.length : values.reduce((s, v) => s + v.value, 0),
      possible: values.reduce((s, v) => s + v.possible, 0),
      best: def.streak && done.length ? Math.min(...done) : null,
    });
  }
  return out;
}
