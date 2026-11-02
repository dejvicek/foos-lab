import { DISCIPLINES, discipline, type DisciplineId } from './disciplines';

export type Plan = Partial<Record<DisciplineId, number>>;

export const CHANGEOVER_MIN = 1;
export const BREAK_MIN = 10;
export const BREAK_AFTER_MIN = 60;
export const FINAL_MIN = 10;
export const DURATION_OPTIONS = Array.from({ length: 13 }, (_, i) => 60 + i * 15); // 1:00–4:00
export const DEFAULT_DURATION = 180;
/** Simulace ligového kola potřebuje aspoň 4 hráče (dvojice). */
export const SIM_MIN_PLAYERS = 4;

/** Výchozí výběr úplně prvního konfigurovatelného tréninku (PRD 4.6). */
export const DEFAULT_SELECTION: DisciplineId[] = DISCIPLINES.filter((d) => d.id !== 'chain').map((d) => d.id);

/** Kolik kol cvičení je potřeba, aby se ve dvojicích vystřídali všichni. */
export function drillRoundsNeeded(players: number, tables: number): number {
  return Math.max(1, Math.ceil(players / (2 * tables)));
}

/** Pořadí kol: cvičení, zápasy (pořadí katalogu, stejné za sebou), simulace. */
export function planSequence(plan: Plan): DisciplineId[] {
  return DISCIPLINES.flatMap((d) => Array.from({ length: Math.max(0, plan[d.id] ?? 0) }, () => d.id));
}

export interface TimelineItem {
  kind: 'round' | 'break' | 'final';
  discipline?: DisciplineId;
  start: number;
  min: number;
}

/** Časová osa: kolo + přechod, pauza po kole, které první přesáhne hodinu od poslední pauzy, závěrečný Zápis. */
export function planTimeline(sequence: DisciplineId[]): { items: TimelineItem[]; total: number } {
  const items: TimelineItem[] = [];
  let t = 0;
  let sincePause = 0;
  sequence.forEach((id, i) => {
    const min = discipline(id).min;
    items.push({ kind: 'round', discipline: id, start: t, min });
    t += min + CHANGEOVER_MIN;
    sincePause += min + CHANGEOVER_MIN;
    if (sincePause >= BREAK_AFTER_MIN && i < sequence.length - 1) {
      items.push({ kind: 'break', start: t, min: BREAK_MIN });
      t += BREAK_MIN;
      sincePause = 0;
    }
  });
  items.push({ kind: 'final', start: t, min: FINAL_MIN });
  return { items, total: t + FINAL_MIN };
}

/** Naplánovaný čas; simulace se při méně než 4 hráčích nehraje, takže se nepočítá (zůstává ale vybraná). */
export const plannedMinutes = (plan: Plan, players?: number): number =>
  planTimeline(planSequence(players !== undefined && players < SIM_MIN_PLAYERS ? { ...plan, sim: 0 } : plan)).total;

/**
 * Rozloží vybrané disciplíny do délky tréninku: cvičení tolik kol, aby se vystřídali všichni,
 * zápasy a simulace 1 kolo, pak dokola další kola zápasů, dokud se vejdou (PRD 4.6).
 */
export function autoPlan(
  selected: DisciplineId[],
  durationMin: number,
  players: number,
  tables: number,
  minimum: Plan = {},
  /** Cvičení, která se už hrála: kola se nepřidávají (pozdní hráč je propásl). */
  played: Set<DisciplineId> = new Set(),
): Plan {
  const plan: Plan = {};
  for (const d of DISCIPLINES) {
    if (!selected.includes(d.id)) continue;
    plan[d.id] = d.kind === 'drill' ? (played.has(d.id) ? (minimum[d.id] ?? 1) : drillRoundsNeeded(players, tables)) : 1;
  }
  for (const [id, n] of Object.entries(minimum) as [DisciplineId, number][]) plan[id] = Math.max(plan[id] ?? 0, n);

  const matches = DISCIPLINES.filter((d) => d.kind === 'match' && selected.includes(d.id)).map((d) => d.id);
  let i = 0;
  let misses = 0;
  while (matches.length && misses < matches.length) {
    const id = matches[i % matches.length];
    const next = { ...plan, [id]: (plan[id] ?? 0) + 1 };
    if (plannedMinutes(next, players || undefined) <= durationMin) {
      Object.assign(plan, next);
      misses = 0;
    } else misses++;
    i++;
  }
  return plan;
}
