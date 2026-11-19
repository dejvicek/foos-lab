/**
 * Reálná doba míčku z průběhu her (18. 11. 2026): stránka Disciplíny ji ukazuje adminovi u každé disciplíny.
 *  - Zápas: od prvního ťuknutého gólu (kterýkoli leg) do ukončení utkání, děleno všemi odehranými góly.
 *  - Cvičení s pokusy: od prvního ťuknutého pokusu do ukončení kola u stolu, děleno ťuknutými pokusy (všichni
 *    hráči skupiny).
 *  - Čistá desítka: jen celkový čas – průměr časů splnění (výsledek kola > 0).
 * Počítají se klubové i vlastní tréninky; měření bez ukončení nebo bez ťuknutí se vynechá.
 */
import { DISCIPLINES } from './disciplines';
import { isStreakDrill, usesBalls } from './ballTime';
import { setScores } from './legState';
import { legIds } from './matchFormat';
import { practiceRounds } from './practice';
import { drillItemId } from './queue';
import { buildSchedule, canBuildSchedule } from './schedule';
import { parseSoloKey } from './solo';
import { parseScoreValue } from './standings';
import { effectiveEvents } from './timeline';
import type { DisciplineId, GameEvent, Match, Training } from './types';

/** Jedno měření: sekundy na míček (zápas, cvičení s pokusy), u Čisté desítky celkový čas v sekundách. */
export interface BallSample {
  discipline: DisciplineId;
  sec: number;
}

/** Reálná doba: průměr přes měření a jejich počet (zápasy / kola / splnění). */
export interface BallAverage {
  sec: number;
  n: number;
}

export interface BallAverages {
  /** Všechny zápasy a simulace bez ohledu na disciplínu. */
  matches: BallAverage | null;
  /** Všechna cvičení s pokusy bez ohledu na disciplínu. */
  drills: BallAverage | null;
  /** Po disciplínách; u Čisté desítky průměrný celkový čas. */
  by: Partial<Record<DisciplineId, BallAverage>>;
}

function goalSample(t: Training, m: Match, id: DisciplineId, end: number | undefined, firstGoal: Map<string, number>): BallSample | null {
  if (end === undefined || setScores(m)) return null;
  const ids = legIds(m);
  const first = Math.min(...ids.map((x) => firstGoal.get(x) ?? Infinity));
  let goals = 0;
  for (const x of ids) {
    const ga = parseScoreValue(t.scores[x]?.ga);
    const gb = parseScoreValue(t.scores[x]?.gb);
    if (ga !== null && gb !== null) goals += ga + gb;
  }
  if (!Number.isFinite(first) || end <= first || goals === 0) return null;
  return { discipline: id, sec: (end - first) / 1000 / goals };
}

function drillSample(id: DisciplineId, evs: GameEvent[], end: number | undefined): BallSample | null {
  const taps = effectiveEvents(evs.filter((e) => e.kind === 'hit' || e.kind === 'miss'));
  if (end === undefined || !taps.length) return null;
  const first = Math.min(...taps.map((e) => e.at));
  if (end <= first) return null;
  return { discipline: id, sec: (end - first) / 1000 / taps.length };
}

/** Všechna měření: zápasy a cvičení s pokusy (sekundy na míček), Čistá desítka (celkový čas). */
export function ballSamples(trainings: Training[]): BallSample[] {
  const out: BallSample[] = [];
  const push = (s: BallSample | null) => s && out.push(s);
  for (const t of trainings) {
    // Čistá desítka: výsledek kola je čas splnění v sekundách (0 = nesplněno).
    for (const results of Object.values(t.soloResults ?? {}))
      for (const [key, v] of Object.entries(results)) {
        const d = DISCIPLINES.find((x) => x.metric === parseSoloKey(key).metric);
        if (d && isStreakDrill(d) && typeof v === 'number' && v > 0) out.push({ discipline: d.id, sec: v });
      }
    if (!t.events?.length) continue;
    const byItem = new Map<string, GameEvent[]>();
    const firstGoal = new Map<string, number>();
    for (const e of t.events) {
      byItem.set(e.itemId, [...(byItem.get(e.itemId) ?? []), e]);
      if (e.kind === 'goal' && e.delta === 1) firstGoal.set(e.itemId, Math.min(firstGoal.get(e.itemId) ?? Infinity, e.at));
    }
    if (t.format === 'custom' && canBuildSchedule(t)) {
      const s = buildSchedule(t);
      for (const m of s.matches) {
        const id = m.discipline ?? (m.block === 'sim' ? 'sim' : undefined);
        if (id) push(goalSample(t, m, id, t.playTimes?.[m.id]?.endedAt, firstGoal));
      }
      for (const row of s.sections.flatMap((x) => x.rows))
        row.cells.forEach((c, j) => {
          if (c?.type !== 'group' || !c.discipline || !usesBalls(c.discipline)) return;
          const item = drillItemId(row, j + 1, c.players);
          push(drillSample(c.discipline, byItem.get(item) ?? [], t.playTimes?.[item]?.endedAt));
        });
    } else if (t.format === 'practice') {
      for (const r of practiceRounds(t)) {
        const end = t.playTimes?.[r.item]?.endedAt;
        if (r.match) push(goalSample(t, r.match, r.drill, t.playTimes?.[r.match.id]?.endedAt ?? end, firstGoal));
        else if (usesBalls(r.drill)) push(drillSample(r.drill, byItem.get(r.item) ?? [], end));
      }
    }
  }
  return out;
}

const average = (xs: number[]): BallAverage | null => (xs.length ? { sec: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length } : null);

/** Reálná doba míčku: zápasy celkem, cvičení celkem (bez ohledu na disciplínu) a po disciplínách. */
export function ballAverages(trainings: Training[]): BallAverages {
  const samples = ballSamples(trainings);
  const groups = new Map<DisciplineId, number[]>();
  for (const s of samples) groups.set(s.discipline, [...(groups.get(s.discipline) ?? []), s.sec]);
  const kind = (s: BallSample) => DISCIPLINES.find((d) => d.id === s.discipline)?.kind;
  return {
    matches: average(samples.filter((s) => kind(s) !== 'drill').map((s) => s.sec)),
    drills: average(samples.filter((s) => kind(s) === 'drill' && usesBalls(s.discipline)).map((s) => s.sec)),
    by: Object.fromEntries([...groups].map(([id, xs]) => [id, average(xs)!])),
  };
}
