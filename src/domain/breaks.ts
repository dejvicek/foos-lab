import { roundSequence } from './customSchedule';
import { autoBreaks, normalizeBreaks } from './plan';
import { pauseId } from './queue';
import type { BreakDef, Training } from './types';

/** Délky pauzy na výběr (min). */
export const BREAK_OPTIONS = [5, 10, 15, 20, 25, 30];

type T = Pick<Training, 'attendees' | 'plan' | 'lockedRounds' | 'breaks' | 'tables' | 'mode' | 'playTimes'>;

/** Pauzy tréninku srovnané podle pozice: vlastní, jinak automatické (10 min po každé hodině). */
export function breaksOf(t: T): BreakDef[] {
  const seq = roundSequence(t);
  return normalizeBreaks(t.breaks ?? autoBreaks(seq), seq.length);
}

/** Počet hracích kol (pauza může být po 1. až předposledním). */
export const roundsOf = (t: T): number => roundSequence(t).length;

/** Pauza k už začala (organizátor ji zahájil, nebo rovnou spustil další kolo). */
const pauseBegun = (t: T, k: number) => {
  const p = t.playTimes?.[pauseId(k)];
  return p?.startedAt !== undefined || p?.endedAt !== undefined;
};

/**
 * Kola 1…n jsou minulost: odehraná (zamčená) kola a vše do zahájené pauzy včetně. Pauza po kole < n
 * se nehýbe; zahájená pauza se nehýbe a jiná pauza se před ni nedostane (pořadí pauz = jejich ID).
 */
const playedUpTo = (t: T) =>
  Math.max(t.lockedRounds.length, ...breaksOf(t).flatMap((b, k) => (pauseBegun(t, k) ? [b.after + 1] : [])));

/** Smí se pauza na pozici `after` přesouvat / odebrat? (ne mezi odehranými koly) */
export const breakMovable = (t: T, i: number): boolean => (breaksOf(t)[i]?.after ?? 0) >= playedUpTo(t);

/** Volná místa pro pauzu: za odehranými koly, mezi koly, kde ještě pauza není. */
export function freeSlots(t: T, ignore?: number): number[] {
  const taken = new Set(breaksOf(t).filter((_, j) => j !== ignore).map((b) => b.after));
  const out: number[] = [];
  for (let a = Math.max(1, playedUpTo(t)); a <= roundsOf(t) - 1; a++) if (!taken.has(a)) out.push(a);
  return out;
}

const withBreaks = <X extends T>(t: X, list: BreakDef[]): X => ({ ...t, breaks: normalizeBreaks(list, roundsOf(t)) });

/** Přidá pauzu 10 min doprostřed zbývající části tréninku (na volné místo). */
export function addBreak<X extends T>(t: X): X {
  const free = freeSlots(t);
  if (!free.length) return t;
  const lo = Math.max(1, playedUpTo(t));
  const mid = (lo + roundsOf(t) - 1) / 2;
  const after = free.reduce((best, a) => (Math.abs(a - mid) < Math.abs(best - mid) ? a : best), free[0]);
  return withBreaks(t, [...breaksOf(t), { after, min: 10 }]);
}

export function removeBreak<X extends T>(t: X, i: number): X {
  if (!breakMovable(t, i)) return t;
  return withBreaks(t, breaksOf(t).filter((_, j) => j !== i));
}

/** Přesune pauzu za kolo `after`; ne do odehrané části a ne na místo jiné pauzy. */
export function moveBreak<X extends T>(t: X, i: number, after: number): X {
  const list = breaksOf(t);
  if (!list[i] || !breakMovable(t, i) || list[i].after === after || !freeSlots(t, i).includes(after)) return t;
  return withBreaks(t, list.map((b, j) => (j === i ? { ...b, after } : b)));
}

/** Délka pauzy; jde opravit i u pauzy, která už proběhla. */
export function setBreakMin<X extends T>(t: X, i: number, min: number): X {
  const list = breaksOf(t);
  if (!list[i]) return t;
  return withBreaks(t, list.map((b, j) => (j === i ? { ...b, min } : b)));
}

/** Kam se pauza posune šipkou: nejbližší volné místo dřív / později (null = nikam). */
export function stepTarget(t: T, i: number, dir: -1 | 1): number | null {
  if (!breakMovable(t, i)) return null;
  const at = breaksOf(t)[i]?.after ?? 0;
  const free = freeSlots(t, i).filter((a) => (dir < 0 ? a < at : a > at));
  return free.length ? (dir < 0 ? free[free.length - 1] : free[0]) : null;
}
