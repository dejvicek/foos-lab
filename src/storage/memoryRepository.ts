import { isEmptyScore } from '../domain/training';
import { StorageError } from './errors';
import type { AppData, RemoteHandlers, Repository } from './repository';

const copy = <T>(v: T): T => structuredClone(v);

/** Repozitář v paměti – pro testy a vývoj bez sítě. */
export function memoryRepository(
  initial?: AppData,
  opts: { failLoad?: boolean; failSaves?: number; failPermanent?: number } = {},
): Repository & { snapshot(): AppData; emit(): RemoteHandlers; subscribers(): number } {
  let data: AppData = copy(initial ?? { players: [], trainings: [] });
  let failSaves = opts.failSaves ?? 0;
  let failPermanent = opts.failPermanent ?? 0;

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
  };

  const training = (id: string) => data.trainings.find((t) => t.id === id);
  const listeners = new Set<RemoteHandlers>();
  const fanOut: RemoteHandlers = {
    score: (...a) => listeners.forEach((l) => l.score(...a)),
    solo: (...a) => listeners.forEach((l) => l.solo(...a)),
    training: (...a) => listeners.forEach((l) => l.training(...a)),
    resync: () => listeners.forEach((l) => l.resync()),
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
    deletePlayer: (id) =>
      write(() => {
        data.players = data.players.filter((p) => p.id !== id);
      }),
    saveTraining: (t) =>
      write(() => {
        const existing = training(t.id);
        const next = { ...copy(t), scores: existing ? existing.scores : {}, soloResults: existing ? existing.soloResults : {} };
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
        else delete t.soloResults[playerId];
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
    bumpScore: (trainingId, matchId, field, delta, max) =>
      write(() => {
        const t = training(trainingId);
        if (!t) throw new StorageError('Trénink neexistuje', true, 'trénink už neexistuje');
        const cur = t.scores[matchId] ?? {};
        const pair = field === 'ga' || field === 'gb' ? (['ga', 'gb'] as const) : (['la', 'lb'] as const);
        const next = { ...cur, [pair[0]]: cur[pair[0]] ?? 0, [pair[1]]: cur[pair[1]] ?? 0 };
        t.scores[matchId] = { ...next, [field]: Math.min(max, Math.max(0, (cur[field] ?? 0) + delta)) };
      }),
    bumpSolo: (trainingId, playerId, key, delta, max) =>
      write(() => {
        const t = training(trainingId);
        if (!t) throw new StorageError('Trénink neexistuje', true, 'trénink už neexistuje');
        const mine = { ...t.soloResults[playerId] };
        mine[key] = Math.min(max, Math.max(0, (mine[key] ?? 0) + delta));
        t.soloResults[playerId] = mine;
      }),
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
