/**
 * Čistá desítka (11. 11. 2026): hráč opakuje stejný pokus, dokud nemá 10 povedených po sobě.
 * Nepovedený pokus sérii vynuluje. Výsledek (soloResults) je čas v sekundách od začátku kola do
 * posledního pokusu série; 0 = zatím nesplněno. Série se počítá z událostí ťukání (průběh hry),
 * výsledek a pokusy jdou do databáze stejně jako u ostatních cvičení (tap_drill).
 */
import { effectiveEvents } from './timeline';
import { isPractice } from './practice';
import { roundMin } from './disciplines';
import { parseSoloKey, type SoloMetricDef } from './solo';
import type { DisciplineId, GameEvent, PlayerId, SoloKey, Training } from './types';

export interface StreakState {
  /** Povedené po sobě teď (po splnění = délka série). */
  run: number;
  attempts: number;
  /** Začátek měření: zahájení kola, jinak první pokus; null = nic. */
  startedAt: number | null;
  /** Kdy padl poslední pokus série; null = nesplněno. */
  doneAt: number | null;
  /** Čas do splnění v sekundách; null = nesplněno. */
  seconds: number | null;
  /** Poslední platný pokus hráče (pro Zpět). */
  last: GameEvent | null;
}

/** Sekundy od začátku do splnění – aspoň 1 (0 znamená nesplněno). */
export const streakSeconds = (startedAt: number, doneAt: number): number => Math.max(1, Math.round((doneAt - startedAt) / 1000));

/** Stav série hráče u stolu / v kole `itemId` z událostí a zahájení. */
export function streakState(events: GameEvent[] | undefined, playerId: PlayerId, itemId: string, startedAt: number | undefined, length: number): StreakState {
  const list = effectiveEvents((events ?? []).filter((e) => e.itemId === itemId && e.playerId === playerId && (e.kind === 'hit' || e.kind === 'miss')));
  const start = startedAt ?? list[0]?.at ?? null;
  let run = 0;
  let doneAt: number | null = null;
  for (const e of list) {
    run = e.kind === 'hit' ? run + 1 : 0;
    if (run >= length) {
      doneAt = e.at;
      break;
    }
  }
  return {
    run,
    attempts: list.length,
    startedAt: start,
    doneAt,
    seconds: doneAt !== null && start !== null ? streakSeconds(start, doneAt) : null,
    last: list.length ? list[list.length - 1] : null,
  };
}

/** Stav série hráče v tréninku (události a zahájení utkání / kola). */
export const trainingStreak = (t: Training, playerId: PlayerId, itemId: string, def: SoloMetricDef): StreakState =>
  streakState(t.events, playerId, itemId, t.playTimes?.[itemId]?.startedAt, def.streak ?? 0);

/**
 * Časový limit kola v sekundách: v klubovém tréninku délka kola (pak se jde na další disciplínu),
 * ve vlastním tréninku žádný (délka je jen odhad).
 */
export function streakLimitSec(t: Training, key: SoloKey): number | null {
  if (isPractice(t)) return null;
  return roundMin(parseSoloKey(key).metric as DisciplineId, t.disciplineMin) * 60;
}

/** Vypršel limit kola (klubový trénink)? */
export const streakTimeUp = (s: StreakState, limitSec: number | null, now: number): boolean =>
  limitSec !== null && s.startedAt !== null && s.doneAt === null && now - s.startedAt > limitSec * 1000;

/**
 * Ťuknutí ve cvičení na čas: o kolik se změní výsledek (čas) a pokusy; null = nejde.
 * ✓ / ✗ (delta 1): po splnění nebo po limitu ne; poslední ✓ série zapíše čas.
 * Zpět (delta −1): jen poslední pokus hráče a jen stejného druhu; vrácení posledního ✓ série čas smaže.
 */
export function streakTap(s: StreakState, def: SoloMetricDef, ok: boolean, delta: 1 | -1, now: number, value: number, limitSec: number | null = null): { dValue: number; dAttempts: number } | null {
  if (delta > 0) {
    if (s.doneAt !== null || streakTimeUp(s, limitSec, now) || s.attempts >= def.max) return null;
    const completes = ok && s.run + 1 >= (def.streak ?? 0);
    return { dValue: completes ? streakSeconds(s.startedAt ?? now, now) : 0, dAttempts: 1 };
  }
  if (!s.last || (s.last.kind === 'hit') !== ok) return null;
  return { dValue: s.doneAt !== null ? -value : 0, dAttempts: -1 };
}

/** „3:07“ */
export const streakTime = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
