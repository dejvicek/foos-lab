/** Reálná doba gólu z průběhu her (18. 11. 2026): stránka Disciplíny ji ukazuje adminovi u každé disciplíny. */
import { setScores } from './legState';
import { legIds } from './matchFormat';
import { buildSchedule, canBuildSchedule } from './schedule';
import { parseScoreValue } from './standings';
import type { DisciplineId, Training } from './types';

/** Jeden změřený zápas: sekundy od prvního gólu do ukončení utkání / počet odehraných gólů. */
export interface GoalSample {
  discipline: DisciplineId;
  secPerGoal: number;
}

/** Reálná doba gólu: průměr přes zápasy a jejich počet. */
export interface GoalAverage {
  sec: number;
  matches: number;
}

/**
 * Změřené zápasy klubových tréninků: zápas s ukončením (Zdržovači), aspoň jedním ťuknutým gólem a
 * zapsaným skóre. Čas od prvního gólu (ťuknutí +1 v kterémkoli legu) do ukončení utkání, děleno všemi
 * odehranými góly zápasu (součet legů). Starší simulace v setech se nepočítá.
 */
export function goalSamples(trainings: Training[]): GoalSample[] {
  const out: GoalSample[] = [];
  for (const t of trainings) {
    if (t.format !== 'custom' || !t.events?.length || !canBuildSchedule(t)) continue;
    const firstGoal = new Map<string, number>();
    for (const e of t.events) if (e.kind === 'goal' && e.delta === 1) firstGoal.set(e.itemId, Math.min(firstGoal.get(e.itemId) ?? Infinity, e.at));
    for (const m of buildSchedule(t).matches) {
      if (setScores(m)) continue;
      const id = m.discipline ?? (m.block === 'sim' ? 'sim' : undefined);
      const end = t.playTimes?.[m.id]?.endedAt;
      if (!id || end === undefined) continue;
      const ids = legIds(m);
      const first = Math.min(...ids.map((x) => firstGoal.get(x) ?? Infinity));
      let goals = 0;
      for (const x of ids) {
        const ga = parseScoreValue(t.scores[x]?.ga);
        const gb = parseScoreValue(t.scores[x]?.gb);
        if (ga !== null && gb !== null) goals += ga + gb;
      }
      if (!Number.isFinite(first) || end <= first || goals === 0) continue;
      out.push({ discipline: id, secPerGoal: (end - first) / 1000 / goals });
    }
  }
  return out;
}

const average = (xs: number[]): GoalAverage | null => (xs.length ? { sec: xs.reduce((a, b) => a + b, 0) / xs.length, matches: xs.length } : null);

/** Reálná doba gólu: celkově (bez ohledu na disciplínu) a po disciplínách. */
export function goalAverages(trainings: Training[]): { all: GoalAverage | null; by: Partial<Record<DisciplineId, GoalAverage>> } {
  const samples = goalSamples(trainings);
  const groups = new Map<DisciplineId, number[]>();
  for (const s of samples) groups.set(s.discipline, [...(groups.get(s.discipline) ?? []), s.secPerGoal]);
  return {
    all: average(samples.map((s) => s.secPerGoal)),
    by: Object.fromEntries([...groups].map(([id, xs]) => [id, average(xs)!])),
  };
}
