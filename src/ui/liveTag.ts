import { pauseStates, trainingStarted } from '../domain/queue';
import { canBuildSchedule, buildSchedule } from '../domain/schedule';
import type { PlayerId, Training } from '../domain/types';
import type { ItemState } from '../domain/queue';
import { todayIso } from './dates';
import { trainingQueue } from './queue';
import { playingRow, roundStates } from './roundState';

/** Za jak dlouho po zahájení se nedohraný trénink už nebere jako běžící (zapomenuté potvrzení). */
const STALE_MS = 12 * 60 * 60_000;

/**
 * Trénink právě běží: je zahájený, něco zbývá dohrát a od prvního zahájení neuplynulo 12 hodin
 * (zapomenuté potvrzení). Proběhlý trénink tedy neběží – i bez potvrzeného konce.
 */
export function trainingRunning(t: Training, states: Map<string, ItemState>, nowMs: number): boolean {
  if (!trainingStarted(t)) return false;
  const all = [...states.values()];
  if (all.length && all.every((x) => x.state === 'done')) return false;
  const startedAt = Math.min(...Object.values(t.playTimes ?? {}).flatMap((p) => (p.startedAt !== undefined ? [p.startedAt] : [])));
  return !(Number.isFinite(startedAt) && nowMs - startedAt > STALE_MS);
}

/**
 * PRD 7.1: štítek tréninku v seznamu podle skutečnosti (zahájená a potvrzená utkání), ne podle hodin.
 * Nezahájený dnešní: plánovaný začátek; běžící: hrané kolo; dohraný dnes: „Dnes, dohráno“.
 */
export function liveTag(t: Training, playerId: PlayerId | null, now: Date): string | null {
  const plays = !!playerId && t.attendees.includes(playerId);
  const today = todayIso(now) === t.date;
  if (!trainingStarted(t) || !canBuildSchedule(t)) {
    if (!today) return null;
    return plays ? `Hraješ, začátek v ${t.startTime}` : `Dnes v ${t.startTime}`;
  }
  const s = buildSchedule(t);
  const nowMs = now.getTime();
  const { queue, states } = trainingQueue(t, nowMs, s);
  const all = [...states.values()];
  if (all.length && all.every((x) => x.state === 'done')) return today ? 'Dnes, dohráno' : null;
  const startedAt = Math.min(...Object.values(t.playTimes ?? {}).flatMap((p) => (p.startedAt !== undefined ? [p.startedAt] : [])));
  if (Number.isFinite(startedAt) && nowMs - startedAt > STALE_MS) return today ? 'Dnes' : null;
  const ref = playingRow(s, roundStates(s, states, pauseStates(queue, t.playTimes ?? {}, nowMs)));
  const what = ref ? `běží ${s.sections[ref.section].rows[ref.row].label}` : 'pauza';
  return plays ? `Hraješ – ${what}` : what.charAt(0).toUpperCase() + what.slice(1);
}
