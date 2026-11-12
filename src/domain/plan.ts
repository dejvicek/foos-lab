import { DISCIPLINES, discipline, drillInPairs, roundMin, roundStep, type DisciplineId, type DisciplineMins } from './disciplines';
import type { BreakDef, Breaks, TemplateBreak } from './types';

export type Plan = Partial<Record<DisciplineId, number>>;

export const CHANGEOVER_MIN = 1;
export const BREAK_MIN = 10;
/** Délky pauzy na výběr (min). */
export const BREAK_OPTIONS = [5, 10, 15, 20, 25, 30];
export const DURATION_OPTIONS = Array.from({ length: 13 }, (_, i) => 60 + i * 15); // 1:00–4:00
export const DEFAULT_DURATION = 180;
/** Simulace ligového kola potřebuje aspoň 4 hráče (dvojice). */
export const SIM_MIN_PLAYERS = 4;

/** Výchozí výběr vlastního tréninku sám: cvičení pro jednoho. */
export const SOLO_SELECTION: DisciplineId[] = ['passWallLane', 'penaltySolo', 'backShotSolo'];

/** Výchozí výběr klubového tréninku pro 1 hráče: z nich jen ta, která klub nabízí („bez brankáře“ ne). */
export const clubSoloSelection = (): DisciplineId[] => SOLO_SELECTION.filter((id) => !discipline(id).practiceOnly);

/**
 * Hraje se disciplína při daném počtu hráčů? Zápasy aspoň 2, simulace aspoň 4, cvičení s bránícím
 * aspoň 2 (trénink pro 1 hráče je vynechá). Bez počtu hráčů (undefined) se nic nevynechává.
 */
export function playable(id: DisciplineId, players?: number): boolean {
  const d = discipline(id);
  if (d.practiceOnly) return false; // Čistá desítka a „bez brankáře“ jen ve vlastním tréninku (ten má vlastní plán)
  if (players === undefined) return true;
  if (d.kind === 'sim') return players >= SIM_MIN_PLAYERS;
  if (d.kind === 'match' || d.needsPartner) return players >= 2;
  return true;
}

/** Kolik kol cvičení je potřeba, aby se ve dvojicích vystřídali všichni. */
export function drillRoundsNeeded(players: number, tables: number): number {
  return Math.max(1, Math.ceil(players / (2 * tables)));
}

/**
 * Pořadí disciplín: uložené (ze šablony), ostatní (přidané v průvodci) podle katalogu za nejbližší
 * disciplínu, která je v katalogu před nimi. Bez pořadí = katalog (cvičení, zápasy, simulace).
 */
export function orderedDisciplines(order?: DisciplineId[] | null): DisciplineId[] {
  const all = DISCIPLINES.map((d) => d.id);
  if (!order?.length) return all;
  const out = [...new Set(order.filter((id) => all.includes(id)))];
  for (const id of all) {
    if (out.includes(id)) continue;
    const ci = all.indexOf(id);
    let pos = 0;
    out.forEach((x, i) => {
      if (all.indexOf(x) < ci) pos = i + 1;
    });
    out.splice(pos, 0, id);
  }
  return out;
}

/** Pořadí kol: podle pořadí disciplín (výchozí katalog), kola stejné disciplíny za sebou. */
export function planSequence(plan: Plan, order?: DisciplineId[] | null): DisciplineId[] {
  return orderedDisciplines(order).flatMap((id) => Array.from({ length: Math.max(0, plan[id] ?? 0) }, () => id));
}

export interface TimelineItem {
  kind: 'round' | 'break';
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

/** Pauzy šablony do tréninku: každá po posledním kole své disciplíny; po posledním kole tréninku žádná. */
export function placeDisciplineBreaks(sequence: DisciplineId[], list: TemplateBreak[]): BreakDef[] {
  const out: BreakDef[] = [];
  for (const b of list) {
    const after = sequence.lastIndexOf(b.after) + 1;
    if (after < 1 || after >= sequence.length || out.some((o) => o.after === after)) continue;
    out.push({ after, min: b.min });
  }
  return out.sort((x, y) => x.after - y.after);
}

/** Pauzy jako seznam: vlastní, ze šablony (podle času), nebo starší výchozí po sekcích. */
export function resolveBreaks(breaks: Breaks | undefined, sequence: DisciplineId[]): BreakDef[] {
  if (Array.isArray(breaks)) return breaks;
  if (breaks && 'afterDisciplines' in breaks) return placeDisciplineBreaks(sequence, breaks.afterDisciplines);
  return autoBreaks(sequence);
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

/** Časová osa: kolo + přechod, pauzy (vlastní, jinak automatické). Zápis na konci už není (9. 11. 2026). */
export function planTimeline(sequence: DisciplineId[], breaks?: Breaks, mins?: DisciplineMins | null): { items: TimelineItem[]; total: number } {
  const list = normalizeBreaks(resolveBreaks(breaks, sequence), sequence.length);
  const byAfter = new Map(list.map((b, index) => [b.after, { ...b, index }]));
  const items: TimelineItem[] = [];
  let t = 0;
  sequence.forEach((id, i) => {
    const min = roundMin(id, mins);
    items.push({ kind: 'round', discipline: id, start: t, min });
    t += min + CHANGEOVER_MIN;
    const b = byAfter.get(i + 1);
    if (b) {
      items.push({ kind: 'break', start: t, min: b.min, index: b.index });
      t += b.min;
    }
  });
  return { items, total: t };
}

/** Naplánovaný čas; co se při daném počtu hráčů nehraje (simulace pod 4, zápasy a cvičení s bránícím pro 1), se nepočítá (zůstává ale vybrané). */
export const plannedMinutes = (plan: Plan, players?: number, breaks?: Breaks, mins?: DisciplineMins | null): number =>
  planTimeline(planSequence(playablePlan(plan, players)), breaks, mins).total;

/** Plán bez disciplín, které se při daném počtu hráčů nehrají. */
export function playablePlan(plan: Plan, players?: number): Plan {
  return Object.fromEntries((Object.entries(plan) as [DisciplineId, number][]).map(([id, n]) => [id, playable(id, players) ? n : 0])) as Plan;
}

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
  breaks: Breaks = null,
  /** Délky kol tréninku (snímek katalogu); chybí = výchozí. */
  mins: DisciplineMins | null = null,
): Plan {
  const plan: Plan = {};
  for (const d of DISCIPLINES) {
    if (!selected.includes(d.id)) continue;
    // Asymetrická disciplína (Zeď, Start 0:3) vždy po dvou kolech, aby si každý vyzkoušel obě role.
    // Cvičení na dvě varianty: každé vystřídání má dvě kola (varianta 1, varianta 2).
    const drillRounds = drillRoundsNeeded(players, tables) * (drillInPairs(d) ? 2 : 1);
    plan[d.id] = d.kind === 'drill' ? (played.has(d.id) ? (minimum[d.id] ?? 1) : drillRounds) : d.paired ? 2 : 1;
  }
  for (const [id, n] of Object.entries(minimum) as [DisciplineId, number][]) plan[id] = Math.max(plan[id] ?? 0, n);

  const matches = DISCIPLINES.filter((d) => d.kind === 'match' && selected.includes(d.id) && playable(d.id, players || undefined)).map((d) => d.id);
  let i = 0;
  let misses = 0;
  while (matches.length && misses < matches.length) {
    const id = matches[i % matches.length];
    const next = { ...plan, [id]: (plan[id] ?? 0) + (discipline(id).paired ? 2 : 1) };
    if (plannedMinutes(next, players || undefined, breaks, mins) <= durationMin) {
      Object.assign(plan, next);
      misses = 0;
    } else misses++;
    i++;
  }
  return plan;
}

/** Výchozí počet kol zápasu: párový (Zeď, Start 0:3, Start 4:5) 2, jinak 1. */
export const defaultMatchRounds = (id: DisciplineId): number => (discipline(id).paired ? 2 : 1);

/**
 * Plán bez doplňování (šablony, 9. 11. 2026): cvičení tolik kol, aby se vystřídali všichni (u dvou
 * variant dvojnásobek; už hrané nechá), zápasy podle `counts` (jinak 1 / párové 2), simulace 1.
 * Zbytek času zůstane volný – doplnit jde ručně („Doplnit kola“).
 */
export function manualPlan(
  selected: DisciplineId[],
  players: number,
  tables: number,
  counts: Plan = {},
  minimum: Plan = {},
  played: Set<DisciplineId> = new Set(),
): Plan {
  const plan: Plan = {};
  for (const d of DISCIPLINES) {
    if (!selected.includes(d.id)) continue;
    if (d.kind === 'drill') plan[d.id] = played.has(d.id) ? (minimum[d.id] ?? 1) : drillRoundsNeeded(players, tables) * (drillInPairs(d) ? 2 : 1);
    else if (d.kind === 'match') plan[d.id] = (counts[d.id] ?? 0) > 0 ? counts[d.id]! : defaultMatchRounds(d.id);
    else plan[d.id] = 1;
  }
  for (const [id, n] of Object.entries(minimum) as [DisciplineId, number][]) plan[id] = Math.max(plan[id] ?? 0, n);
  return plan;
}

/**
 * Doplní kola do zbývajícího času: vybrané zápasy dokola (párové po dvou); bez hratelných zápasů
 * (např. trénink pro 1 hráče) vybraná cvičení (na dvě varianty po dvou). Simulace se nepřidává.
 * Nic nepřetáhne délku tréninku; když se nic nevejde, vrátí stejný plán.
 */
export function fillPlan(plan: Plan, durationMin: number, players: number, breaks: Breaks = null, mins: DisciplineMins | null = null): Plan {
  const selected = DISCIPLINES.filter((d) => (plan[d.id] ?? 0) > 0 && d.kind !== 'sim' && !d.retired && playable(d.id, players || undefined));
  const matches = selected.filter((d) => d.kind === 'match');
  const pool = matches.length ? matches : selected.filter((d) => d.kind === 'drill');
  const out: Plan = { ...plan };
  let i = 0;
  let misses = 0;
  while (pool.length && misses < pool.length) {
    const d = pool[i % pool.length];
    const step = roundStep(d);
    const next = { ...out, [d.id]: (out[d.id] ?? 0) + step };
    if (plannedMinutes(next, players || undefined, breaks, mins) <= durationMin) {
      Object.assign(out, next);
      misses = 0;
    } else misses++;
    i++;
  }
  return out;
}
