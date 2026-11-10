import type { Training } from '../domain/types';
import { setAttempts, setSolo } from '../domain/training';
import type { AppData, Changes } from '../storage/repository';

import { pendingKey } from '../storage/ops';

export { pendingKey };

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
  const catalog = busy(pendingKey.catalog) ? local.catalog : remote.catalog;
  return { players: busy(pendingKey.players) ? local.players : remote.players, trainings: [...trainings, ...unsaved], ...(catalog ? { catalog } : {}) };
}

/**
 * Dorovnání jen o změny (PRD 8): změněné řádky se zapíšou, smazané zmizí; kde čeká vlastní zápis, zůstává
 * lokální hodnota (stejně jako u mergeRemote). Nejdřív smazání, pak zápisy – řádek smazaný a znovu
 * zapsaný tedy platí. Tréninky, kterých se změny netýkají, zůstávají tytéž objekty (rozpis se nepřepočítá).
 */
export function applyChanges(local: AppData, c: Changes, busy: (key: string) => boolean): AppData {
  // Hráči a katalog.
  let players = local.players;
  if (!busy(pendingKey.players) && (c.players.length || c.deleted.players.length)) {
    const gone = new Set(c.deleted.players);
    const changed = new Map(c.players.map((p) => [p.id, p]));
    players = [...players.filter((p) => !gone.has(p.id) || changed.has(p.id)).map((p) => changed.get(p.id) ?? p), ...c.players.filter((p) => !players.some((x) => x.id === p.id))];
  }
  const catalog = c.catalog !== undefined && !busy(pendingKey.catalog) ? c.catalog : local.catalog;

  // Tréninky: smazané pryč, změněná konfigurace přes stávající skóre a výsledky, nové přibudou.
  const config = new Map(c.trainings.map((t) => [t.id, t]));
  const gone = new Set(c.deleted.trainings.filter((id) => !config.has(id) && !busy(pendingKey.training(id))));
  const byId = new Map<string, Training>();
  const order: string[] = [];
  for (const t of local.trainings) {
    if (gone.has(t.id)) continue;
    const remote = config.get(t.id);
    byId.set(t.id, remote ? mergeTrainingEcho(t, remote, busy(pendingKey.training(t.id))) : t);
    order.push(t.id);
  }
  for (const t of c.trainings)
    if (!byId.has(t.id)) {
      byId.set(t.id, t);
      order.push(t.id);
    }
  const edit = (id: string, fn: (t: Training) => Training) => {
    const t = byId.get(id);
    if (t) byId.set(id, fn(t));
  };

  // Skóre.
  for (const d of c.deleted.scores)
    if (!busy(pendingKey.score(d.trainingId, d.matchId)))
      edit(d.trainingId, (t) => {
        if (!(d.matchId in t.scores)) return t;
        const { [d.matchId]: _, ...scores } = t.scores;
        return { ...t, scores };
      });
  for (const r of c.scores) if (!busy(pendingKey.score(r.trainingId, r.matchId))) edit(r.trainingId, (t) => ({ ...t, scores: { ...t.scores, [r.matchId]: r.score } }));

  // Výsledky cvičení (a pokusy).
  for (const d of c.deleted.solo) if (!busy(pendingKey.solo(d.trainingId, d.playerId, d.key))) edit(d.trainingId, (t) => setAttempts(setSolo(t, d.playerId, d.key, null), d.playerId, d.key, null));
  for (const r of c.solo)
    if (!busy(pendingKey.solo(r.trainingId, r.playerId, r.key))) edit(r.trainingId, (t) => setAttempts(setSolo(t, r.playerId, r.key, r.value), r.playerId, r.key, r.attempts));

  // Časy utkání.
  for (const d of c.deleted.playTimes)
    if (!busy(pendingKey.time(d.trainingId, d.itemId)))
      edit(d.trainingId, (t) => {
        if (!t.playTimes || !(d.itemId in t.playTimes)) return t;
        const { [d.itemId]: _, ...times } = t.playTimes;
        return withTimes(t, times);
      });
  for (const r of c.playTimes) if (!busy(pendingKey.time(r.trainingId, r.itemId))) edit(r.trainingId, (t) => withTimes(t, { ...t.playTimes, [r.itemId]: r.time }));

  const trainings = order.map((id) => byId.get(id)!);
  const same = trainings.length === local.trainings.length && trainings.every((t, i) => t === local.trainings[i]);
  if (same && players === local.players && catalog === local.catalog) return local;
  return { ...local, players, trainings: same ? local.trainings : trainings, ...(catalog ? { catalog } : {}) };
}
