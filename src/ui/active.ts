import { readyKeyOf, TRAINING_ITEM, type ItemState, type QueueEntry } from '../domain/queue';
import { isClub } from '../domain/practice';
import { canBuildSchedule } from '../domain/schedule';
import type { PlayerId, Training } from '../domain/types';
import { trainingQueue } from './queue';

/** Trénink zahájený před víc než 12 h se už nebere jako běžící (zapomenuté „Ukončit“). */
const MAX_AGE_MS = 12 * 3_600_000;

export interface Active {
  training: Training;
  queue: QueueEntry[];
  states: Map<string, ItemState>;
  /** Hraju (jsem mezi přítomnými) – jinak jsem jen organizátor (bez Moje hry). */
  plays: boolean;
  /** Moje utkání je na řadě a já (moje strana) ještě nejsem připravený (tečka u Moje hry). */
  myTurn: boolean;
  /** Mám utkání na řadě nebo ho hraju (appka se otevře na Moje hry). */
  myGame: boolean;
}

/** Kdy trénink začal: zahájení organizátorem, u staršího první zahájené utkání. */
function startedAt(t: Training): number | null {
  const times = t.playTimes ?? {};
  if (times[TRAINING_ITEM]?.startedAt !== undefined) return times[TRAINING_ITEM].startedAt!;
  const starts = Object.values(times).flatMap((p) => (p.startedAt !== undefined ? [p.startedAt] : []));
  return starts.length ? Math.min(...starts) : null;
}

/**
 * Probíhající klubový trénink (kohokoli): zahájený před méně než 12 h a nedohraný; z více ten naposledy zahájený.
 * „Trénink“ v navigaci ho rovnou otevře (19. 11. 2026, *rozhodnutí uživatele*).
 */
export function runningTraining(trainings: Training[], now: number): Training | null {
  const candidates = trainings
    .filter((t) => isClub(t) && canBuildSchedule(t))
    .map((t) => ({ t, s: startedAt(t) }))
    .filter((x): x is { t: Training; s: number } => x.s !== null && now - x.s < MAX_AGE_MS)
    .sort((a, b) => b.s - a.s);
  for (const { t } of candidates) {
    const { queue, states } = trainingQueue(t, now);
    const items = queue.filter((e) => e.kind === 'item');
    if (!items.every((e) => states.get(e.id)?.state === 'done')) return t;
  }
  return null;
}

/** Běžící trénink, na kterém hráč hraje nebo který organizuje (založil); z více ten naposledy zahájený. */
export function activeFor(trainings: Training[], playerId: PlayerId | null, now: number): Active | null {
  if (!playerId) return null;
  const candidates = trainings
    .filter((t) => isClub(t) && (t.attendees.includes(playerId) || t.createdBy === playerId) && canBuildSchedule(t))
    .map((t) => ({ t, s: startedAt(t) }))
    .filter((x): x is { t: Training; s: number } => x.s !== null && now - x.s < MAX_AGE_MS)
    .sort((a, b) => b.s - a.s);
  for (const { t } of candidates) {
    const { queue, states } = trainingQueue(t, now);
    const items = queue.filter((e): e is Extract<QueueEntry, { kind: 'item' }> => e.kind === 'item');
    if (items.every((e) => states.get(e.id)?.state === 'done')) continue; // dohráno
    const myItems = items.filter((e) => e.players.includes(playerId));
    const mine = myItems.map((e) => states.get(e.id)!);
    return {
      training: t,
      queue,
      states,
      plays: t.attendees.includes(playerId),
      // Na řadě a ještě jsem se (moje strana) nepřihlásil jako připravený.
      myTurn: myItems.some((e) => {
        const s = states.get(e.id)!;
        return s.state === 'ready' && s.ready?.[readyKeyOf(e, playerId)] === undefined;
      }),
      myGame: mine.some((s) => s.state === 'ready' || s.state === 'playing'),
    };
  }
  return null;
}

/**
 * Dnešní klubový trénink, na kterém jsem odehrál všechno své (20. 11. 2026): pro kartu „Tvůj trénink“ – v Moje hry
 * po posledním kole a nahoře v Trénincích do konce dne. Trénink musí být zahájený a já přítomný.
 */
export function myFinishedToday(trainings: Training[], playerId: PlayerId | null, now: number): Training | null {
  if (!playerId) return null;
  const d = new Date(now);
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mine = trainings
    .filter((t) => isClub(t) && t.date === today && t.attendees.includes(playerId) && canBuildSchedule(t) && t.playTimes?.[TRAINING_ITEM]?.startedAt !== undefined)
    .sort((a, b) => (a.startTime < b.startTime ? 1 : -1));
  for (const t of mine) {
    const { queue, states } = trainingQueue(t, now);
    const items = queue.filter((e): e is Extract<QueueEntry, { kind: 'item' }> => e.kind === 'item' && e.players.includes(playerId));
    if (items.length && items.every((e) => states.get(e.id)?.state === 'done')) return t;
  }
  return null;
}
