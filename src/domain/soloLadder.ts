import { MIN_TRAININGS, resolveRange, type LadderRange, type LadderView } from './ladder';
import { parseSoloKey, SOLO_METRICS, soloMetric } from './solo';
import { isPractice } from './practice';
import { DISCIPLINES, placesOf } from './disciplines';
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
  /** Cvičení na čas (Čistá desítka): nejlepší čas v sekundách; null = ani jednou nesplněno. */
  best?: number | null;
}

export interface SoloLadderTable {
  metric: SoloMetric;
  ranked: SoloLadderRow[];
  lowData: SoloLadderRow[];
}

/**
 * Výsledky sólové části, které mají v rozpisu tréninku místo (stejně jako úklid 5.8). Vlastní trénink
 * (5.11) rozpis nemá – platí každá série (klíč `metrika@n`).
 */
export function validSolo(t: Training): SoloResults {
  if (isPractice(t)) return t.soloResults;
  return pruneEntries(t).soloResults;
}

/** Odkud žebříček bere výsledky: Stanoviště (5.9), nebo Vlastní (5.11). */
export type SoloSource = 'club' | 'practice';

/** Cvičení metriky se hraje i v klubu (pak jeho výsledky z vlastního tréninku duo patří do Stanovišť). */
export function clubMetric(m: SoloMetric): boolean {
  const d = DISCIPLINES.find((x) => x.metric === m) ?? DISCIPLINES.find((x) => x.soloMetric === m);
  return !!d && placesOf(d).club;
}

/**
 * Výsledky tréninku pro žebříček (12. 11. 2026 – stejné podmínky se počítají napříč): Stanoviště =
 * klubové tréninky + z vlastních tréninků cvičení, která jsou i v klubu; Vlastní = z vlastních tréninků
 * jen cvičení pouze pro vlastní trénink (solo, Čistá desítka).
 */
function sourceSolo(t: Training, source: SoloSource): SoloResults {
  const all = validSolo(t);
  if (!isPractice(t)) return source === 'club' ? all : {};
  const out: SoloResults = {};
  for (const [p, values] of Object.entries(all)) {
    const kept = Object.fromEntries(Object.entries(values).filter(([k]) => clubMetric(parseSoloKey(k).metric) === (source === 'club')));
    if (Object.keys(kept).length) out[p] = kept;
  }
  return out;
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
 * `source` 'practice' = žebříček Vlastní (5.11): stejná pravidla, jen z vlastních tréninků.
 */
export function computeSoloLadder(
  trainings: Training[],
  range: LadderRange,
  _view: LadderView,
  today: string,
  source: SoloSource = 'club',
): SoloLadderTable[] {
  const r = resolveRange(range, today);
  const inRange = trainings.filter((t) => !((r.from && t.date < r.from) || (r.to && t.date > r.to)));
  const valid = new Map(inRange.map((t) => [t, sourceSolo(t, source)]));
  return SOLO_METRICS.flatMap((def) => {
    if (def.streak) return streakTable(inRange, def.id, (t) => valid.get(t)!);
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

/**
 * Čistá desítka (11. 11. 2026): pořadí podle nejlepšího času (méně = lépe), kdo ještě nesplnil, je
 * za ostatními. Hranice „málo dat“ jako jinde: tréninky, ve kterých hráč cvičení zkoušel.
 * sum = splněné série, sumMax = všechny série, avg = nejlepší čas.
 */
function streakTable(trainings: Training[], metric: SoloMetric, solo: (t: Training) => SoloResults): SoloLadderTable[] {
  const acc = new Map<PlayerId, { trainings: number; records: number; done: number; best: number | null }>();
  for (const t of trainings)
    for (const [p, values] of Object.entries(solo(t))) {
      const vals = Object.entries(values).filter(([k, v]) => parseSoloKey(k).metric === metric && v !== undefined && v !== null);
      if (!vals.length) continue;
      const cur = acc.get(p) ?? { trainings: 0, records: 0, done: 0, best: null };
      cur.trainings++;
      for (const [, v] of vals) {
        cur.records++;
        if (v > 0) {
          cur.done++;
          cur.best = cur.best === null ? v : Math.min(cur.best, v);
        }
      }
      acc.set(p, cur);
    }
  if (!acc.size) return [];
  const rows: SoloLadderRow[] = [...acc.entries()].map(([playerId, x]) => ({
    playerId,
    trainings: x.trainings,
    records: x.records,
    sum: x.done,
    sumMax: x.records,
    avg: x.best ?? 0,
    rate: x.records ? x.done / x.records : 0,
    best: x.best,
  }));
  rows.sort(
    (a, b) =>
      (a.best === null ? 1 : 0) - (b.best === null ? 1 : 0) ||
      (a.best ?? 0) - (b.best ?? 0) ||
      b.trainings - a.trainings ||
      (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0),
  );
  return [{ metric, ranked: rows.filter((x) => x.trainings >= MIN_TRAININGS), lowData: rows.filter((x) => x.trainings < MIN_TRAININGS) }];
}
