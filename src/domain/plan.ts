import { DISCIPLINES, discipline, type DisciplineId } from './disciplines';
import type { BreakDef } from './types';

export type Plan = Partial<Record<DisciplineId, number>>;

export const CHANGEOVER_MIN = 1;
export const BREAK_MIN = 10;
export const FINAL_MIN = 10;
export const DURATION_OPTIONS = Array.from({ length: 13 }, (_, i) => 60 + i * 15); // 1:00–4:00
export const DEFAULT_DURATION = 180;
/** Simulace ligového kola potřebuje aspoň 4 hráče (dvojice). */
export const SIM_MIN_PLAYERS = 4;

/** Výchozí výběr úplně prvního konfigurovatelného tréninku (PRD 4.6). */
export const DEFAULT_SELECTION: DisciplineId[] = DISCIPLINES.filter((d) => !d.retired && !d.optional).map((d) => d.id);

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
  /** Pauza: pořadí v seznamu pauz (normalizovaném). */
  index?: number;
}

/** Automatické pauzy (výchozí): 10 min po každé sekci – po cvičeních a po zápasech (před simulací). */
export function autoBreaks(sequence: DisciplineId[]): BreakDef[] {
  const out: BreakDef[] = [];
  sequence.forEach((id, i) => {
    const next = sequence[i + 1];
    if (next && discipline(id).kind !== discipline(next).kind) out.push({ after: i + 1, min: BREAK_MIN });
  });
  return out;
}
/** Pauzy srovnané podle pozice: jen mezi koly (po 1. až předposledním), na jednom místě nejvýš jedna. */
export function normalizeBreaks(breaks: BreakDef[], rounds: number): BreakDef[] {
  const seen = new Set<number>();
  const out: BreakDef[] = [];
  for (const b of [...breaks].sort((x, y) => x.after - y.after)) {
    const after = Math.min(Math.max(1, b.after), rounds - 1);
    if (after < 1 || seen.has(after)) continue;
    seen.add(after);
    out.push({ after, min: b.min });
  }
  return out;
}

/** Časová osa: kolo + přechod, pauzy (vlastní, jinak automatické), závěrečný Zápis. */
export function planTimeline(sequence: DisciplineId[], breaks?: BreakDef[] | null): { items: TimelineItem[]; total: number } {
  const list = normalizeBreaks(breaks ?? autoBreaks(sequence), sequence.length);
  const byAfter = new Map(list.map((b, index) => [b.after, { ...b, index }]));
  const items: TimelineItem[] = [];
  let t = 0;
  sequence.forEach((id, i) => {
    const min = discipline(id).min;
    items.push({ kind: 'round', discipline: id, start: t, min });
    t += min + CHANGEOVER_MIN;
    const b = byAfter.get(i + 1);
    if (b) {
      items.push({ kind: 'break', start: t, min: b.min, index: b.index });
      t += b.min;
    }
  });
  items.push({ kind: 'final', start: t, min: FINAL_MIN });
  return { items, total: t + FINAL_MIN };
}

/** Naplánovaný čas; simulace se při méně než 4 hráčích nehraje, takže se nepočítá (zůstává ale vybraná). */
export const plannedMinutes = (plan: Plan, players?: number, breaks?: BreakDef[] | null): number =>
  planTimeline(planSequence(players !== undefined && players < SIM_MIN_PLAYERS ? { ...plan, sim: 0 } : plan), breaks).total;

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
  /** Vlastní pauzy tréninku (počítají se do času); null = automatické. */
  breaks: BreakDef[] | null = null,
): Plan {
  const plan: Plan = {};
  for (const d of DISCIPLINES) {
    if (!selected.includes(d.id)) continue;
    // Asymetrická disciplína (Zeď, Start 0:3) vždy po dvou kolech, aby si každý vyzkoušel obě role.
    plan[d.id] = d.kind === 'drill' ? (played.has(d.id) ? (minimum[d.id] ?? 1) : drillRoundsNeeded(players, tables)) : d.paired ? 2 : 1;
  }
  for (const [id, n] of Object.entries(minimum) as [DisciplineId, number][]) plan[id] = Math.max(plan[id] ?? 0, n);

  const matches = DISCIPLINES.filter((d) => d.kind === 'match' && selected.includes(d.id)).map((d) => d.id);
  let i = 0;
  let misses = 0;
  while (matches.length && misses < matches.length) {
    const id = matches[i % matches.length];
    const next = { ...plan, [id]: (plan[id] ?? 0) + (discipline(id).paired ? 2 : 1) };
    if (plannedMinutes(next, players || undefined, breaks) <= durationMin) {
      Object.assign(plan, next);
      misses = 0;
    } else misses++;
    i++;
  }
  return plan;
}
