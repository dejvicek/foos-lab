import { computeLadder, MIN_TRAININGS, resolveRange, type LadderRange, type LadderView } from './ladder';
import { before, hasScores, lastDay, rankMoves, type Move } from './moves';
import { computeMatchLadder, isClub, type MatchKindFilter } from './practice';
import { computeSoloLadder, hasSoloFor, type SoloSource } from './soloLadder';
import type { DisciplineId, PlayerId, SoloMetric, Training } from './types';

/**
 * Můj profil (20. 11. 2026, *rozhodnutí uživatele*): kde jsem ve všech žebříčcích za období – místo z kolika,
 * posun od posledního tréninku, nebo kolik tréninků mi do pořadí chybí. Počítá stejně jako stránka Žebříčky.
 */
export type PlacementRef = { kind: 'main' } | { kind: 'match'; discipline: DisciplineId } | { kind: 'drill'; metric: SoloMetric; source: SoloSource };

export interface Placement {
  ref: PlacementRef;
  /** Místo (1 = první); null = pod čarou („málo dat“). */
  place: number | null;
  /** Hráčů v pořadí. */
  of: number;
  trainings: number;
  move?: Move;
  /** Den posledního tréninku, proti kterému je posun. */
  since?: string;
}

const ids = (rows: { playerId: PlayerId }[]) => rows.map((r) => r.playerId);

function placed<T extends { playerId: PlayerId; trainings: number }>(
  ranked: T[],
  lowData: T[],
  playerId: PlayerId,
  ref: PlacementRef,
  prev: T[] | null,
  day: string | null,
): Placement | null {
  const i = ranked.findIndex((r) => r.playerId === playerId);
  if (i >= 0)
    return { ref, place: i + 1, of: ranked.length, trainings: ranked[i].trainings, move: rankMoves(prev ? ids(prev) : null, ids(ranked)).get(playerId), ...(day ? { since: day } : {}) };
  const low = lowData.find((r) => r.playerId === playerId);
  return low ? { ref, place: null, of: ranked.length, trainings: low.trainings } : null;
}

export function placementsOf(trainings: Training[], playerId: PlayerId, range: LadderRange, view: LadderView, today: string, matchKind: MatchKindFilter = 'all'): Placement[] {
  const out: Placement[] = [];
  // Zápasy (hlavní tabulka)
  const main = computeLadder(trainings, range, view, today);
  const mainDay = lastDay(trainings, range, today, (t) => isClub(t) && hasScores(t));
  const mainPrev = mainDay ? computeLadder(before(trainings, mainDay), range, view, today).ranked : null;
  const m = placed(main.ranked, main.lowData, playerId, { kind: 'main' }, mainPrev, mainDay);
  if (m) out.push(m);
  // Zápasy podle disciplín
  const r = resolveRange(range, today);
  const matches = (ts: Training[]) => computeMatchLadder(ts, r.from, r.to, MIN_TRAININGS, matchKind, view);
  const matchDay = lastDay(trainings, range, today, hasScores);
  const prevMatches = matchDay ? matches(before(trainings, matchDay)) : null;
  for (const t of matches(trainings)) {
    const p = placed(t.ranked, t.lowData, playerId, { kind: 'match', discipline: t.discipline }, prevMatches ? (prevMatches.find((x) => x.discipline === t.discipline)?.ranked ?? []) : null, matchDay);
    if (p) out.push(p);
  }
  // Cvičení: Týmové a Solo/Duo
  for (const source of ['club', 'practice'] as const) {
    const day = lastDay(trainings, range, today, (t) => hasSoloFor(t, source));
    const prev = day ? computeSoloLadder(before(trainings, day), range, view, today, source) : null;
    for (const t of computeSoloLadder(trainings, range, view, today, source)) {
      const p = placed(t.ranked, t.lowData, playerId, { kind: 'drill', metric: t.metric, source }, prev ? (prev.find((x) => x.metric === t.metric)?.ranked ?? []) : null, day);
      if (p) out.push(p);
    }
  }
  return out;
}

/** Soused v pořadí a rozdíl v hlavním kritériu (kladný = o kolik je lepší / horší). */
export interface Neighbour {
  playerId: PlayerId;
  place: number;
  gap: number;
}

/**
 * Odstup na sousední místa (20. 11. 2026): kolik mi v hlavním kritériu chybí na hráče přede mnou a jaký
 * mám náskok před hráčem za mnou (vždy kladně; 0 = stejně, rozhodla další kritéria). `value` = hlavní kritérium.
 */
export function gapsOf<T extends { playerId: PlayerId }>(ranked: T[], playerId: PlayerId, value: (r: T) => number): { place: number; of: number; ahead?: Neighbour; behind?: Neighbour } | null {
  const i = ranked.findIndex((r) => r.playerId === playerId);
  if (i < 0) return null;
  const v = value(ranked[i]);
  const diff = (other: T) => Math.abs(value(other) - v);
  return {
    place: i + 1,
    of: ranked.length,
    ...(i > 0 ? { ahead: { playerId: ranked[i - 1].playerId, place: i, gap: diff(ranked[i - 1]) } } : {}),
    ...(i < ranked.length - 1 ? { behind: { playerId: ranked[i + 1].playerId, place: i + 2, gap: diff(ranked[i + 1]) } } : {}),
  };
}
