import { computeLadder, MIN_TRAININGS } from './ladder';
import { rankMoves, type Move } from './moves';
import { parseSoloKey, soloMetric } from './solo';
import { buildSchedule, canBuildSchedule } from './schedule';
import { computeStandings } from './standings';
import { pruneEntries } from './training';
import type { PlayerId, SoloKey, SoloMetric, Training } from './types';

/**
 * Závěr tréninku „Tvůj trénink“ (20. 11. 2026, *rozhodnutí uživatele*): po mém posledním kole jedna karta místo
 * prázdné obrazovky – dnešní místo v souhrnu, rozdíl a legy, výsledky cvičení a posun v žebříčku (forma,
 * Průměr) proti stavu bez tohoto tréninku. Počítá z hotových výpočtů (souhrn 5.5, žebříček 5.6).
 */
export interface Recap {
  trainingId: string;
  /** Místo v souhrnu tréninku (1 = první) z kolika; null = nehrál jsem žádný zápas. */
  place: number | null;
  of: number;
  diff: number;
  legWins: number;
  legLosses: number;
  drills: { metric: SoloMetric; key: SoloKey; value: number; max: number }[];
  /** Posun v žebříčku Zápasy (forma, Průměr); undefined = beze změny nebo nejde určit. */
  move?: Move;
  /** Pod čarou: kolik tréninků do pořadí ještě chybí. */
  missing?: number;
}

export function trainingRecap(trainings: Training[], t: Training, playerId: PlayerId, today: string): Recap | null {
  if (!t.attendees.includes(playerId) || !canBuildSchedule(t)) return null;
  const st = computeStandings(buildSchedule(t), t.scores, t.attendees);
  const played = st.rows.filter((r) => r.legs > 0);
  const i = played.findIndex((r) => r.playerId === playerId);
  const me = i >= 0 ? played[i] : null;
  const drills = Object.entries(pruneEntries(t).soloResults[playerId] ?? {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      const metric = parseSoloKey(k as SoloKey).metric;
      return { metric, key: k as SoloKey, value: v as number, max: soloMetric(metric).max };
    })
    .sort((a, b) => parseSoloKey(a.key).round - parseSoloKey(b.key).round);
  if (!me && !drills.length) return null;
  const range = { kind: 'form' } as const;
  const now = computeLadder(trainings, range, 'avg', today);
  const prev = computeLadder(trainings.filter((x) => x.id !== t.id), range, 'avg', today);
  const low = now.lowData.find((r) => r.playerId === playerId);
  const move = rankMoves(prev.ranked.map((r) => r.playerId), now.ranked.map((r) => r.playerId)).get(playerId);
  return {
    trainingId: t.id,
    place: me ? i + 1 : null,
    of: played.length,
    diff: me?.diff ?? 0,
    legWins: me?.wins ?? 0,
    legLosses: me ? me.legs - me.wins : 0,
    drills,
    ...(move !== undefined && move !== 0 ? { move } : {}),
    ...(low ? { missing: MIN_TRAININGS - low.trainings } : {}),
  };
}
