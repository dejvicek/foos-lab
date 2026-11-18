/**
 * Délka kola zápasu z doby gólu (18. 11. 2026, *rozhodnutí uživatele*): kolo zápasové disciplíny a vlna
 * simulace trvá dobu gólu × nejvyšší možný počet gólů ve formátu (BO, gólů na leg, rozhodující leg o 2 se
 * stropem, u scénářů jen odehrané góly), zaokrouhleno nahoru na celé minuty. Doba gólu je výchozí stejná
 * pro všechny disciplíny (celkový průměr z naměřených zápasů), admin ji může u disciplíny přepsat.
 *
 * Trénink si doby gólů uloží při založení / úpravě (`Training.goalSec`); trénink bez nich počítá jako dřív
 * (délka legu × počet legů), takže časy starších tréninků se nemění.
 */
import { discipline, DISCIPLINES, type DisciplineMins } from './disciplines';
import { legCap, legTarget, winsByTwo } from './legState';
import { DEFAULT_FORMAT, formatMins, formatOf, legOf, withFormat, type MatchFormat, type MatchFormats } from './matchFormat';
import type { DisciplineId, Match } from './types';

/**
 * Výchozí doba gólu v sekundách, stejná pro všechny disciplíny: 40 s (18. 11. 2026, *rozhodnutí uživatele*;
 * celkový průměr změřených zápasů z 17. 11. 2026 byl 36,8 s).
 */
export const DEFAULT_GOAL_SEC = 40;
export const MIN_GOAL_SEC = 5;
export const MAX_GOAL_SEC = 300;

export type GoalSecs = Partial<Record<DisciplineId, number>>;

/** Disciplína, jejíž délka kola se počítá z gólů: zápasy a simulace. */
export const usesGoals = (id: DisciplineId): boolean => {
  const k = discipline(id)?.kind;
  return k === 'match' || k === 'sim';
};

export const validGoalSec = (s: unknown): s is number => typeof s === 'number' && Number.isInteger(s) && s >= MIN_GOAL_SEC && s <= MAX_GOAL_SEC;

/** Doba gólu disciplíny v aktuálním katalogu: úprava admina, jinak výchozí. */
export const goalSecOf = (id: DisciplineId): number => discipline(id)?.goalSec ?? DEFAULT_GOAL_SEC;

/** Snímek dob gólů (zápasy a simulace) – ukládá se do nového / upraveného tréninku. */
export const catalogGoalSec = (): GoalSecs =>
  Object.fromEntries(DISCIPLINES.filter((d) => !d.retired && (d.kind === 'match' || d.kind === 'sim')).map((d) => [d.id, goalSecOf(d.id)]));

/** Nejvíc odehraných gólů v legu: vítěz na cíli (u legu o 2 na stropu), poražený o 1 méně; scénářový start se odečte. */
export function maxLegGoals(m: Match): number {
  const [sa, sb] = m.start ?? [0, 0];
  const top = winsByTwo(m) ? legCap(m) : legTarget(m);
  return Math.max(0, 2 * top - 1 - sa - sb);
}

/** Nejvíc gólů v zápase disciplíny při daném formátu (všechny možné legy). */
export function maxGoals(id: DisciplineId, f: MatchFormat): number {
  const d = discipline(id);
  const base: Match = { id: 'x', block: d.kind === 'sim' ? 'sim' : 'league', round: 1, table: 1, kind: 'doubles', sideA: [], sideB: [], ...(d.start ? { start: d.start } : {}) };
  const m = withFormat(base, f);
  let sum = 0;
  for (let n = 1; n <= (m.bestOf ?? 1); n++) sum += maxLegGoals(legOf(m, n));
  return sum;
}

const minutes = (sec: number) => Math.max(1, Math.ceil(sec / 60));

/** Délka kola z doby gólu: zápas = celé kolo; simulace = 2 vlny, každá na jeden zápas. */
export function goalRoundMin(id: DisciplineId, f: MatchFormat, goalSec: number): number {
  const one = minutes(goalSec * maxGoals(id, f));
  return discipline(id).kind === 'sim' ? 2 * one : one;
}

/**
 * Délka kola v katalogu (stránka Disciplíny, 18. 11. 2026, *rozhodnutí uživatele*): vždy jako BO1 do 6
 * (scénář od svého startu, 5:5 o 2 se stropem 10), i u simulace; v tréninku platí jeho formát.
 */
export const CATALOG_FORMAT: MatchFormat = DEFAULT_FORMAT;
export const catalogRoundMin = (id: DisciplineId): number => (usesGoals(id) ? goalRoundMin(id, CATALOG_FORMAT, goalSecOf(id)) : discipline(id).min);

/**
 * Délky kol pro časovou osu: s dobou gólu z gólů ve formátu, jinak jako dřív (formatMins: délka legu ×
 * počet legů; simulace beze změny).
 */
export function roundMinutes(mins: DisciplineMins | null | undefined, formats: MatchFormats | null | undefined, goalSec: GoalSecs | null | undefined): DisciplineMins | null | undefined {
  const ids = (Object.keys(goalSec ?? {}) as DisciplineId[]).filter((id) => discipline(id) && usesGoals(id) && validGoalSec(goalSec![id]));
  const base = formatMins(mins, formats);
  if (!ids.length) return base;
  const out: DisciplineMins = { ...base };
  for (const id of ids) out[id] = goalRoundMin(id, formatOf(formats, id), goalSec![id]!);
  return out;
}
