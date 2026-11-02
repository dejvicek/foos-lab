import type { Training } from '../domain/types';
import type { AppData } from '../storage/repository';

/** Klíče čekajících zápisů (stejné jako klíče odložených zápisů v useAppState). */
export const pendingKey = {
  score: (tid: string, mid: string) => `${tid}::${mid}`,
  solo: (tid: string, pid: string, key: string) => `${tid}::solo::${pid}::${key}`,
  training: (tid: string) => `${tid}::training`,
  time: (tid: string, itemId: string) => `${tid}::time::${itemId}`,
  players: 'players',
};

function withEvents(t: Training, events: Training['events']): Training {
  const { events: _, ...rest } = t;
  return events && events.length ? { ...rest, events } : rest;
}

/** Časy utkání: prázdný seznam se neukládá (trénink bez měření nemá klíč). */
function withTimes(t: Training, times: Training['playTimes']): Training {
  const { playTimes: _, ...rest } = t;
  return times && Object.keys(times).length ? { ...rest, playTimes: times } : rest;
}

/** Zamčená kola se jen prodlužují: delší seznam vyhrává, týmy simulace jednou zamčené zůstanou. */
function keepLocks(local: Training, remote: Training): Pick<Training, 'lockedRounds' | 'simTeams'> {
  return {
    lockedRounds: remote.lockedRounds.length > local.lockedRounds.length ? remote.lockedRounds : local.lockedRounds,
    simTeams: local.simTeams ?? remote.simTeams,
  };
}

/**
 * Ozvěna změny tréninku ze serveru. Skóre a výsledky se slučují zvlášť; když na uložení čeká
 * vlastní změna konfigurace, ponechá se lokální a převezme se jen delší zamčení kol.
 */
export function mergeTrainingEcho(local: Training, remote: Training, busy: boolean): Training {
  if (!busy) return withEvents({ ...withTimes(remote, local.playTimes), scores: local.scores, soloResults: local.soloResults }, local.events);
  return { ...local, ...keepLocks(local, remote) };
}

/**
 * Dorovnání po výpadku spojení: server vyhrává, kromě míst s vlastním čekajícím zápisem
 * (ťuknutí ve frontě, odložený zápis, neuložená konfigurace).
 */
export function mergeRemote(local: AppData, remote: AppData, busy: (key: string) => boolean): AppData {
  const localById = new Map(local.trainings.map((t) => [t.id, t]));
  const trainings = remote.trainings.map((r) => {
    const l = localById.get(r.id);
    if (!l) return r;
    const base = busy(pendingKey.training(r.id)) ? { ...l, ...keepLocks(l, r) } : r;

    const scores = { ...r.scores };
    for (const mid of new Set([...Object.keys(l.scores), ...Object.keys(r.scores)]))
      if (busy(pendingKey.score(r.id, mid))) {
        if (l.scores[mid]) scores[mid] = l.scores[mid];
        else delete scores[mid];
      }

    const soloResults: Training['soloResults'] = {};
    for (const pid of new Set([...Object.keys(l.soloResults), ...Object.keys(r.soloResults)])) {
      const mine: Record<string, number> = { ...r.soloResults[pid] };
      for (const key of new Set([...Object.keys(l.soloResults[pid] ?? {}), ...Object.keys(r.soloResults[pid] ?? {})]))
        if (busy(pendingKey.solo(r.id, pid, key))) {
          const v = l.soloResults[pid]?.[key];
          if (v === undefined) delete mine[key];
          else mine[key] = v;
        }
      if (Object.keys(mine).length) soloResults[pid] = mine;
    }
    const times = { ...r.playTimes };
    for (const id of new Set([...Object.keys(l.playTimes ?? {}), ...Object.keys(r.playTimes ?? {})]))
      if (busy(pendingKey.time(r.id, id))) {
        if (l.playTimes?.[id]) times[id] = l.playTimes[id];
        else delete times[id];
      }
    // Události se jen přidávají: sjednotit podle ID (server + ještě neodeslané lokální).
    const events = [...(r.events ?? []), ...(l.events ?? []).filter((e) => !r.events?.some((x) => x.id === e.id))];
    return withEvents(withTimes({ ...base, scores, soloResults }, times), events);
  });
  const remoteIds = new Set(remote.trainings.map((t) => t.id));
  const unsaved = local.trainings.filter((t) => !remoteIds.has(t.id) && busy(pendingKey.training(t.id)));
  return { players: busy(pendingKey.players) ? local.players : remote.players, trainings: [...trainings, ...unsaved] };
}
