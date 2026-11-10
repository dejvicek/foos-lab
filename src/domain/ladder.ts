import { addDays } from './dates';
import { buildSchedule, canBuildSchedule } from './schedule';
import { compareStat, computeStandings, emptyStat, type StatLine } from './standings';
import { parseSoloKey } from './solo';
import { pruneEntries } from './training';
import type { Mode, PlayerId, SoloMetric, Training } from './types';

export type LadderRange = { kind: 'form' } | { kind: 'all' } | { kind: 'custom'; from: string; to: string };
export type LadderView = 'avg' | 'total';

export const FORM_DAYS = 28;
export const MIN_TRAININGS = 3;

export interface LadderRow extends StatLine {
  playerId: PlayerId;
  trainings: number;
  diff: number;
  diffPerLeg: number;
  winRate: number;
  gfPerLeg: number;
  gcPerLeg: number;
  lossPerLeg: number | null;
  simRate: number | null;
}

export function resolveRange(range: LadderRange, today: string): { from: string | null; to: string | null } {
  if (range.kind === 'form') return { from: addDays(today, -(FORM_DAYS - 1)), to: today };
  if (range.kind === 'all') return { from: null, to: null };
  return range.from <= range.to ? { from: range.from, to: range.to } : { from: range.to, to: range.from };
}

function inRange(date: string, r: { from: string | null; to: string | null }): boolean {
  return (r.from === null || date >= r.from) && (r.to === null || date <= r.to);
}

/** Tréninky v období, které jde postavit, se svým souhrnem. */
function trainingsWithStandings(trainings: Training[], range: LadderRange, today: string) {
  const r = resolveRange(range, today);
  return trainings
    .filter((t) => inRange(t.date, r) && canBuildSchedule(t))
    .map((t) => ({ training: t, standings: computeStandings(buildSchedule(t), t.scores, t.attendees) }));
}

function toRow(playerId: PlayerId, s: StatLine, trainings: number): LadderRow {
  const per = (v: number) => (s.legs ? v / s.legs : 0);
  return {
    playerId,
    ...s,
    trainings,
    diff: s.gf - s.gc,
    diffPerLeg: per(s.gf - s.gc),
    winRate: per(s.wins),
    gfPerLeg: per(s.gf),
    gcPerLeg: per(s.gc),
    lossPerLeg: s.lossLegs ? s.loss / s.lossLegs : null,
    simRate: s.simM ? s.simW / s.simM : null,
  };
}

const byId = (a: LadderRow, b: LadderRow) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);

function compareAvg(a: LadderRow, b: LadderRow): number {
  return (
    b.diffPerLeg - a.diffPerLeg ||
    b.winRate - a.winRate ||
    b.gfPerLeg - a.gfPerLeg ||
    (b.simRate ?? 0) - (a.simRate ?? 0) ||
    byId(a, b)
  );
}

function compareTotal(a: LadderRow, b: LadderRow): number {
  return compareStat(a, b) || byId(a, b);
}

/** PRD 5.6: žebříček napříč tréninky. */
export function computeLadder(
  trainings: Training[],
  range: LadderRange,
  view: LadderView,
  today: string,
): { ranked: LadderRow[]; lowData: LadderRow[] } {
  const totals = new Map<PlayerId, { s: StatLine; trainings: number }>();
  for (const { standings } of trainingsWithStandings(trainings, range, today)) {
    for (const row of standings.rows) {
      const acc = totals.get(row.playerId) ?? { s: emptyStat(), trainings: 0 };
      acc.trainings++;
      for (const k of Object.keys(acc.s) as (keyof StatLine)[]) acc.s[k] += row[k];
      totals.set(row.playerId, acc);
    }
  }

  const rows = [...totals.entries()]
    .filter(([, v]) => v.s.legs > 0)
    .map(([id, v]) => toRow(id, v.s, v.trainings));

  // Pořadí jen od MIN_TRAININGS tréninků v období – v Průměru i v Celkem (10. 11. 2026).
  rows.sort(view === 'total' ? compareTotal : compareAvg);
  const ranked = rows.filter((r) => r.trainings >= MIN_TRAININGS);
  const lowData = rows.filter((r) => r.trainings < MIN_TRAININGS);
  return { ranked, lowData };
}

export interface PlayerTrainingRow {
  trainingId: string;
  date: string;
  mode: Mode;
  legs: number;
  wins: number;
  diff: number;
  lossPerLeg: number | null;
  simW: number;
  simM: number;
  /** Výsledky sólové části v tomto tréninku. */
  solo: Partial<Record<SoloMetric, number>>;
}

/** Tréninky hráče v období, nejnovější nahoře. */
export function playerHistory(
  trainings: Training[],
  playerId: PlayerId,
  range: LadderRange,
  today: string,
): PlayerTrainingRow[] {
  const out: PlayerTrainingRow[] = [];
  for (const { training, standings } of trainingsWithStandings(trainings, range, today)) {
    const r = standings.rows.find((x) => x.playerId === playerId);
    if (!r) continue;
    out.push({
      trainingId: training.id,
      date: training.date,
      mode: training.mode,
      legs: r.legs,
      wins: r.wins,
      diff: r.diff,
      lossPerLeg: r.lossLegs ? r.loss / r.lossLegs : null,
      simW: r.simW,
      simM: r.simM,
      solo: averageByMetric(pruneEntries(training).soloResults[playerId] ?? {}),
    });
  }
  return out.map((r, i) => ({ r, i })).sort((a, b) => (a.r.date < b.r.date ? 1 : a.r.date > b.r.date ? -1 : b.i - a.i)).map((x) => x.r);
}

/** Hodnoty hráče v tréninku podle metriky (víc kol téhož cvičení → průměr). */
function averageByMetric(values: Record<string, number>): Partial<Record<SoloMetric, number>> {
  const acc = new Map<SoloMetric, number[]>();
  for (const [k, v] of Object.entries(values)) {
    const m = parseSoloKey(k).metric;
    acc.set(m, [...(acc.get(m) ?? []), v]);
  }
  return Object.fromEntries([...acc.entries()].map(([m, vs]) => [m, vs.reduce((a, b) => a + b, 0) / vs.length]));
}
