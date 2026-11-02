import { TRAINING_ITEM, type ItemState, type QueueEntry } from '../domain/queue';
import { canBuildSchedule } from '../domain/schedule';
import type { PlayerId, Training } from '../domain/types';
import { trainingQueue } from './queue';

/** Trénink zahájený před víc než 12 h se už nebere jako běžící (zapomenuté „Ukončit“). */
const MAX_AGE_MS = 12 * 3_600_000;

export interface Active {
  training: Training;
  queue: QueueEntry[];
  states: Map<string, ItemState>;
  /** Hraju (jsem mezi přítomnými) – jinak jsem jen organizátor (Živě bez Moje hry). */
  plays: boolean;
  /** Moje utkání je na řadě a čeká na zahájení (tečka u Moje hry). */
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

/** Běžící trénink, na kterém hráč hraje nebo který organizuje (založil); z více ten naposledy zahájený. */
export function activeFor(trainings: Training[], playerId: PlayerId | null, now: number): Active | null {
  if (!playerId) return null;
  const candidates = trainings
    .filter((t) => (t.attendees.includes(playerId) || t.createdBy === playerId) && canBuildSchedule(t))
    .map((t) => ({ t, s: startedAt(t) }))
    .filter((x): x is { t: Training; s: number } => x.s !== null && now - x.s < MAX_AGE_MS)
    .sort((a, b) => b.s - a.s);
  for (const { t } of candidates) {
    const { queue, states } = trainingQueue(t, now);
    const items = queue.filter((e): e is Extract<QueueEntry, { kind: 'item' }> => e.kind === 'item');
    if (items.every((e) => states.get(e.id)?.state === 'done')) continue; // dohráno
    const mine = items.filter((e) => e.players.includes(playerId)).map((e) => states.get(e.id)!);
    return {
      training: t,
      queue,
      states,
      plays: t.attendees.includes(playerId),
      myTurn: mine.some((s) => s.state === 'ready'),
      myGame: mine.some((s) => s.state === 'ready' || s.state === 'playing'),
    };
  }
  return null;
}
