import { MIN_TRAININGS, resolveRange, type LadderRange, type LadderView } from './ladder';
import { parseSoloKey, SOLO_METRICS } from './solo';
import { pruneEntries } from './training';
import type { PlayerId, SoloMetric, SoloResults, Training } from './types';

export interface SoloLadderRow {
  playerId: PlayerId;
  /** Počet tréninků se záznamem. */
  trainings: number;
  /** Počet záznamů (cvičení se může v tréninku opakovat). */
  records: number;
  sum: number;
  sumMax: number;
  /** Průměrná hodnota na záznam. */
  avg: number;
  /** sum / sumMax */
  rate: number;
}

export interface SoloLadderTable {
  metric: SoloMetric;
  ranked: SoloLadderRow[];
  lowData: SoloLadderRow[];
}

/** Výsledky sólové části, které mají v rozpisu tréninku místo (stejně jako úklid 5.8). */
export function validSolo(t: Training): SoloResults {
  return pruneEntries(t).soloResults;
}

/** Součty jedné metriky: tréninky se záznamem, počet záznamů a součet hodnot. */
export function aggregateSolo(
  trainings: Training[],
  metric: SoloMetric,
  solo: (t: Training) => SoloResults = validSolo,
): Map<PlayerId, { trainings: number; records: number; sum: number }> {
  const out = new Map<PlayerId, { trainings: number; records: number; sum: number }>();
  for (const t of trainings)
    for (const [p, values] of Object.entries(solo(t))) {
      const vals = Object.entries(values)
        .filter(([k, v]) => parseSoloKey(k).metric === metric && v !== undefined && v !== null)
        .map(([, v]) => v);
      if (!vals.length) continue;
      const cur = out.get(p) ?? { trainings: 0, records: 0, sum: 0 };
      cur.trainings++;
      cur.records += vals.length;
      cur.sum += vals.reduce((a, b) => a + b, 0);
      out.set(p, cur);
    }
  return out;
}

/** PRD 5.9: žebříček pro každou metriku sólové části. */
export function computeSoloLadder(
  trainings: Training[],
  range: LadderRange,
  view: LadderView,
  today: string,
): SoloLadderTable[] {
  const r = resolveRange(range, today);
  const inRange = trainings.filter((t) => !((r.from && t.date < r.from) || (r.to && t.date > r.to)));
  return SOLO_METRICS.flatMap((def) => {
    const acc = aggregateSolo(inRange, def.id);
    if (!acc.size) return [];
    const rows: SoloLadderRow[] = [...acc.entries()].map(([playerId, x]) => ({
      playerId,
      trainings: x.trainings,
      records: x.records,
      sum: x.sum,
      sumMax: x.records * def.max,
      avg: x.sum / x.records,
      rate: x.sum / (x.records * def.max),
    }));
    const cmp = (a: SoloLadderRow, b: SoloLadderRow) =>
      (def.lowerIsBetter ? a.rate - b.rate : b.rate - a.rate) ||
      b.trainings - a.trainings ||
      (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);
    rows.sort(cmp);
    if (view === 'total') return [{ metric: def.id, ranked: rows, lowData: [] }];
    return [
      {
        metric: def.id,
        ranked: rows.filter((x) => x.trainings >= MIN_TRAININGS),
        lowData: rows.filter((x) => x.trainings < MIN_TRAININGS),
      },
    ];
  });
}
