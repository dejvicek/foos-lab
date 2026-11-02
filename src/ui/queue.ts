import { useEffect, useState } from 'react';
import { queueOf, runQueue, type ItemState, type QueueEntry } from '../domain/queue';
import { buildSchedule } from '../domain/schedule';
import type { Schedule, Training } from '../domain/types';
import { usedTables } from './components/TrainingTable';

/** Fronta utkání tréninku a stav každého utkání k času `nowMs` (PRD 4.8). */
export function trainingQueue(t: Training, nowMs: number, s: Schedule = buildSchedule(t)): { queue: QueueEntry[]; states: Map<string, ItemState> } {
  const queue = queueOf(s);
  return { queue, states: runQueue(queue, t.playTimes ?? {}, usedTables(s).map((j) => j + 1), nowMs) };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Délka jako m:ss (h:mm:ss od hodiny). */
export function fmtDur(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Čas dne HH:MM (místní). */
export const clockOf = (ms: number): string => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Aktuální čas obnovovaný každou sekundu (stopky). */
export function useTick(ms = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return now;
}

/** Jména stran / skupiny utkání. */
export function itemNames(e: Extract<QueueEntry, { kind: 'item' }>, names: Record<string, string>): string {
  const nm = (ids: string[]) => ids.map((p) => names[p] ?? '?').join(' + ');
  if (e.match) return `${nm(e.match.sideA)} vs ${nm(e.match.sideB)}`;
  return e.players.map((p) => names[p] ?? '?').join(', ');
}
