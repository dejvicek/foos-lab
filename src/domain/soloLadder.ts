import { MIN_TRAININGS, resolveRange, type LadderRange, type LadderView } from './ladder';
import { parseSoloKey, SOLO_METRICS, soloMetric } from './solo';
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
): Map<PlayerId, { trainings: number; records: number; sum: number; possible: number }> {
  const max = soloMetric(metric).max;
  const out = new Map<PlayerId, { trainings: number; records: number; sum: number; possible: number }>();
  for (const t of trainings)
    for (const [p, values] of Object.entries(solo(t))) {
      const vals = Object.entries(values).filter(([k, v]) => parseSoloKey(k).metric === metric && v !== undefined && v !== null);
      if (!vals.length) continue;
      const cur = out.get(p) ?? { trainings: 0, records: 0, sum: 0, possible: 0 };
      cur.trainings++;
      cur.records += vals.length;
      for (const [k, v] of vals) {
        cur.sum += v;
        // Nedokončené cvičení se počítá z odehraných pokusů, zapsané číslem z plného počtu.
        cur.possible += t.soloAttempts?.[p]?.[k] ?? max;
      }
      out.set(p, cur);
    }
  return out;
}

/**
 * PRD 5.9: žebříček pro každou metriku sólové části. Řazení i hranice „málo dat“ jsou v Průměru
 * i v Celkem stejné (od 10. 11. 2026); zobrazení mění jen to, jak UI hodnotu ukáže.
 */
export function computeSoloLadder(
  trainings: Training[],
  range: LadderRange,
  _view: LadderView,
  today: string,
): SoloLadderTable[] {
  const r = resolveRange(range, today);
  const inRange = trainings.filter((t) => !((r.from && t.date < r.from) || (r.to && t.date > r.to)));
  const valid = new Map(inRange.map((t) => [t, validSolo(t)]));
  return SOLO_METRICS.flatMap((def) => {
    const acc = aggregateSolo(inRange, def.id, (t) => valid.get(t)!);
    if (!acc.size) return [];
    const rows: SoloLadderRow[] = [...acc.entries()].map(([playerId, x]) => ({
      playerId,
      trainings: x.trainings,
      records: x.records,
      sum: x.sum,
      sumMax: x.possible,
      // Průměr na plnou sérii (např. „/ 20“), u nedokončených přepočtený z odehraných pokusů.
      avg: x.possible ? (x.sum / x.possible) * def.max : 0,
      rate: x.possible ? x.sum / x.possible : 0,
    }));
    const cmp = (a: SoloLadderRow, b: SoloLadderRow) =>
      (def.lowerIsBetter ? a.rate - b.rate : b.rate - a.rate) ||
      b.trainings - a.trainings ||
      (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);
    rows.sort(cmp);
    return [
      {
        metric: def.id,
        ranked: rows.filter((x) => x.trainings >= MIN_TRAININGS),
        lowData: rows.filter((x) => x.trainings < MIN_TRAININGS),
      },
    ];
  });
}
