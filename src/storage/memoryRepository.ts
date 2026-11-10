import { isEmptyScore } from '../domain/training';
import { StorageError } from './errors';
import type { GameEvent, PlayTime, Score } from '../domain/types';
import type { AppData, RemoteHandlers, Repository } from './repository';

const copy = <T>(v: T): T => structuredClone(v);

/** Repozitář v paměti – pro testy a vývoj bez sítě. */
export function memoryRepository(
  initial?: AppData,
  /** `loseResponses`: zápis proběhne, ale skončí chybou sítě (ztracená odpověď serveru). */
  opts: { failLoad?: boolean; failSaves?: number; failPermanent?: number; loseResponses?: number } = {},
): Repository & { snapshot(): AppData; emit(): RemoteHandlers; subscribers(): number } {
  let data: AppData = copy(initial ?? { players: [], trainings: [] });
  let failSaves = opts.failSaves ?? 0;
  let failPermanent = opts.failPermanent ?? 0;
  let loseResponses = opts.loseResponses ?? 0;

  const write = async (fn: () => void) => {
    if (failPermanent > 0) {
      failPermanent--;
      throw new StorageError('Simulovaná trvalá chyba', true, 'server změnu odmítl');
    }
    if (failSaves > 0) {
      failSaves--;
      throw new Error('Simulovaná chyba zápisu');
    }
    fn();
    if (loseResponses > 0) {
      loseResponses--;
      throw new Error('Simulovaná ztracená odpověď');
    }
  };

  const training = (id: string) => data.trainings.find((t) => t.id === id);
  const listeners = new Set<RemoteHandlers>();
  const fanOut: RemoteHandlers = {
    score: (...a) => listeners.forEach((l) => l.score(...a)),
    solo: (...a) => listeners.forEach((l) => l.solo(...a)),
    training: (...a) => listeners.forEach((l) => l.training(...a)),
    resync: () => listeners.forEach((l) => l.resync()),
    playTime: (...a) => listeners.forEach((l) => l.playTime(...a)),
    event: (...a) => listeners.forEach((l) => l.event(...a)),
  };

  return {
    snapshot: () => copy(data),
    /** Testy: simulace změny z jiného telefonu (do úložiště nic nezapíše). */
    emit: () => fanOut,
    subscribers: () => listeners.size,
    async loadAll() {
      if (opts.failLoad) throw new Error('Simulovaná chyba načtení');
      return copy(data);
    },
    savePlayer: (p) =>
      write(() => {
        const i = data.players.findIndex((x) => x.id === p.id);
        data.players = i < 0 ? [...data.players, copy(p)] : data.players.map((x) => (x.id === p.id ? copy(p) : x));
      }),
    saveCatalog: (c) =>
      write(() => {
        data.catalog = copy(c);
      }),
    deletePlayer: (id) =>
      write(() => {
        data.players = data.players.filter((p) => p.id !== id);
      }),
    saveTraining: (t) =>
      write(() => {
        const existing = training(t.id);
        const next = { ...copy(t), scores: existing ? existing.scores : {}, soloResults: existing ? existing.soloResults : {} };
        if (existing?.playTimes) next.playTimes = existing.playTimes;
        else delete next.playTimes;
        if (existing?.events) next.events = existing.events;
        else delete next.events;
        data.trainings = existing ? data.trainings.map((x) => (x.id === t.id ? next : x)) : [...data.trainings, next];
      }),
    deleteTraining: (id) =>
      write(() => {
        data.trainings = data.trainings.filter((t) => t.id !== id);
      }),
    saveScore: (trainingId, matchId, s) =>
      write(() => {
        const t = training(trainingId);
        if (!t) throw new Error('Trénink neexistuje');
        if (isEmptyScore(s)) delete t.scores[matchId];
        else t.scores[matchId] = copy(s);
      }),
    saveSolo: (trainingId, playerId, key, value) =>
      write(() => {
        const t = training(trainingId);
        if (!t) throw new StorageError('Trénink neexistuje', true, 'trénink už neexistuje');
        const mine = { ...t.soloResults[playerId] };
        if (value === null) delete mine[key];
        else mine[key] = value;
        if (Object.keys(mine).length) t.soloResults[playerId] = mine;
        else delete t.soloResults[playerId];        if (t.soloAttempts?.[playerId]?.[key] !== undefined) {
          const att = { ...t.soloAttempts[playerId] };
          delete att[key];
          t.soloAttempts = { ...t.soloAttempts, [playerId]: att };
          if (!Object.keys(att).length) delete t.soloAttempts[playerId];
          if (!Object.keys(t.soloAttempts).length) delete t.soloAttempts;
        }
      }),
    replaceSolo: (trainingId, keep) =>
      write(() => {
        const t = training(trainingId);
        if (!t) return;
        const k = new Set(keep.map((x) => `${x.playerId}::${x.key}`));
        const next: typeof t.soloResults = {};
        for (const [p, metrics] of Object.entries(t.soloResults)) {
          const kept = Object.fromEntries(Object.entries(metrics).filter(([m]) => k.has(`${p}::${m}`)));
          if (Object.keys(kept).length) next[p] = kept;
        }
        t.soloResults = next;
      }),
    tapScore: (trainingId, matchId, taps) =>
      write(() => {
        const t = training(trainingId);
        if (!t) throw new StorageError('Trénink neexistuje', true, 'trénink už neexistuje');
        for (const tap of taps) {
          if (t.events?.some((x) => x.id === tap.id)) continue; // už započítáno (opakovaný zápis)
          const goal = tap.field === 'ga' || tap.field === 'gb';
          const e: GameEvent = { id: tap.id, itemId: matchId, at: tap.at, kind: goal ? 'goal' : 'loss', side: tap.field === 'ga' || tap.field === 'la' ? 'A' : 'B', delta: tap.delta < 0 ? -1 : 1 };
          t.events = [...(t.events ?? []), e];
          const cur = t.scores[matchId] ?? {};
          const pair = goal ? (['ga', 'gb'] as const) : (['la', 'lb'] as const);
          const next = { ...cur, [pair[0]]: cur[pair[0]] ?? 0, [pair[1]]: cur[pair[1]] ?? 0 };
          t.scores[matchId] = { ...next, [tap.field]: Math.min(tap.max, Math.max(0, (cur[tap.field] ?? 0) + tap.delta)) };
        }
      }).then((): Score => copy(training(trainingId)?.scores[matchId] ?? {})),
    tapDrill: (trainingId, playerId, key, max, taps) =>
      write(() => {
        const t = training(trainingId);
        if (!t) throw new StorageError('Trénink neexistuje', true, 'trénink už neexistuje');
        const had = t.soloResults[playerId]?.[key];
        let value = had ?? 0;
        let att = t.soloAttempts?.[playerId]?.[key] ?? (had !== undefined ? max : 0);
        for (const tap of taps) {
          // Stejné meze jako tap_drill v databázi: přes plný počet ne, vracet jen to, co je.
          if (tap.dAttempts > 0 && att >= max) continue;
          if (tap.dValue < 0 && value <= 0) continue;
          if (tap.dAttempts < 0 && tap.dValue === 0 && att - value <= 0) continue;
          if (t.events?.some((x) => x.id === tap.id)) continue; // už započítáno (opakovaný zápis)
          t.events = [...(t.events ?? []), { id: tap.id, itemId: tap.itemId, at: tap.at, kind: tap.ok ? 'hit' : 'miss', playerId, delta: tap.delta }];
          value += tap.dValue;
          att += tap.dAttempts;
        }
        t.soloResults[playerId] = { ...t.soloResults[playerId], [key]: value };
        t.soloAttempts = { ...t.soloAttempts, [playerId]: { ...t.soloAttempts?.[playerId], [key]: att } };
      }).then(() => {
        const t = training(trainingId);
        return { value: t?.soloResults[playerId]?.[key] ?? 0, attempts: t?.soloAttempts?.[playerId]?.[key] ?? null };
      }),
    savePlayTime: (trainingId, itemId, p) =>
      write(() => {
        const t = training(trainingId);
        if (!t) throw new StorageError('Trénink neexistuje', true, 'trénink už neexistuje');
        const times = { ...t.playTimes };
        if (!p || (p.startedAt === undefined && p.endedAt === undefined)) delete times[itemId];
        else times[itemId] = copy(p);
        if (Object.keys(times).length) t.playTimes = times;
        else delete t.playTimes;
      }),
    startItem: (trainingId, itemId, at) =>
      write(() => {
        const t = training(trainingId);
        if (!t) throw new StorageError('Trénink neexistuje', true, 'trénink už neexistuje');
        const cur = t.playTimes?.[itemId] ?? {};
        t.playTimes = { ...t.playTimes, [itemId]: { ...cur, startedAt: cur.startedAt ?? at } };
      }).then((): PlayTime => copy(training(trainingId)?.playTimes?.[itemId] ?? {})),
    endItem: (trainingId, itemId, startedAt, endedAt) =>
      write(() => {
        const t = training(trainingId);
        if (!t) throw new StorageError('Trénink neexistuje', true, 'trénink už neexistuje');
        const cur = t.playTimes?.[itemId] ?? {};
        const started = cur.startedAt ?? startedAt;
        t.playTimes = { ...t.playTimes, [itemId]: { ...(started !== undefined ? { startedAt: started } : {}), endedAt: cur.endedAt ?? endedAt } };
      }).then((): PlayTime => copy(training(trainingId)?.playTimes?.[itemId] ?? {})),
    subscribe: (h) => {
      listeners.add(h);
      return () => {
        listeners.delete(h);
      };
    },
    lockRounds: (trainingId, locked, simTeams) =>
      write(() => {
        const t = training(trainingId);
        if (!t) throw new StorageError('Trénink neexistuje', true, 'trénink už neexistuje');
        t.lockedRounds = copy(locked);
        t.simTeams = t.simTeams ?? copy(simTeams);
      }),
    replaceScores: (trainingId, keep) =>
      write(() => {
        const t = training(trainingId);
        if (!t) return;
        const k = new Set(keep);
        t.scores = Object.fromEntries(Object.entries(t.scores).filter(([id]) => k.has(id)));
      }),
  };
}
