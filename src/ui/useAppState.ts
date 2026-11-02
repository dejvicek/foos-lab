import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isEmptyScore, setAttempts, setSolo } from '../domain/training';
import { tapDelta, tapDrill } from '../domain/drillTap';
import type { SoloMetricDef } from '../domain/solo';
import { bump, bumpLimit } from '../domain/legState';
import { parseSoloKey } from '../domain/solo';
import type { Match, MatchId, Player, PlayerId, PlayTime, Score, SoloKey, Training } from '../domain/types';
import { isPermanent, userMessageOf } from '../storage/errors';
import type { AppData, Repository } from '../storage/repository';
import { newUuid } from './ids';
import { mergeRemote, mergeTrainingEcho, pendingKey } from './merge';

export type Status = 'loading' | 'error' | 'ready';
export type SaveState = 'idle' | 'saving' | 'retrying';

export interface AppStore {
  status: Status;
  data: AppData;
  saveState: SaveState;
  /** Zpráva o zápisu, který server trvale odmítl (zahozen, data znovu načtena). */
  saveError: string | null;
  dismissSaveError(): void;
  reload(): void;
  savePlayer(p: Player): void;
  deletePlayer(id: PlayerId): void;
  /** Jen konfigurace tréninku; skóre nemění. */
  saveTraining(t: Training): void;
  /** Konfigurace + smazání skóre zápasů, které v `t.scores` nejsou (po pruneEntries). */
  updateTrainingConfig(t: Training): void;
  deleteTraining(id: string): void;
  /** Ťuknutí na zápas: lokálně hned, do databáze jako přičtení (souběžné telefony se nepřepíšou). */
  bumpScore(trainingId: string, match: Match, field: keyof Score, delta: number): void;
  /** Pokus cvičení (✓ / ✗, delta −1 = zpět): výsledek i počet pokusů, do databáze jako přičtení. */
  tapSolo(trainingId: string, playerId: PlayerId, key: SoloKey, def: SoloMetricDef, ok: boolean, delta: 1 | -1): void;
  /** Ťuknutí ve cvičení: přičtení k výsledku hráče. */
  bumpSolo(trainingId: string, playerId: PlayerId, key: SoloKey, delta: number, max: number): void;
  /** Zdržovači: zahájení / konec utkání (null smaže). */
  setPlayTime(trainingId: string, itemId: string, p: PlayTime | null): void;
  /** Hráč: zamčení kol a týmů simulace přes funkci na serveru (nemá právo měnit trénink). */
  lockRounds(t: Training): void;
  /** Lokálně hned, do úložiště s odstupem SCORE_DEBOUNCE_MS za zápas. */
  saveScore(trainingId: string, matchId: MatchId, s: Score): void;
  /** Výsledek sólové části: lokálně hned, do úložiště s odstupem. null maže. */
  saveSolo(trainingId: string, playerId: PlayerId, key: SoloKey, value: number | null): void;
  newId(): string;
}

export const RETRY_DELAYS_MS = [2000, 5000, 10000];
export const SCORE_DEBOUNCE_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Zapíše / smaže čas utkání v tréninku (prázdný seznam časů se neuchovává). */
function withPlayTime(t: Training, itemId: string, p: PlayTime | null): Training {
  const times = { ...t.playTimes };
  if (!p || (p.startedAt === undefined && p.endedAt === undefined)) delete times[itemId];
  else times[itemId] = p;
  const { playTimes: _, ...rest } = t;
  return Object.keys(times).length ? { ...rest, playTimes: times } : rest;
}

const upsert = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

export function useAppState(repo: Repository): AppStore {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<AppData>({ players: [], trainings: [] });
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [loadNonce, setLoadNonce] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Fronta zápisů; `key` říká, čeho se zápis týká (ozvěny ze serveru ho do uložení nepřepíšou). */
  const queue = useRef<{ run: () => Promise<void>; key?: string }[]>([]);
  const running = useRef(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    repo.loadAll().then(
      (d) => {
        if (!alive) return;
        setData(d);
        setStatus('ready');
      },
      () => alive && setStatus('error'),
    );
    return () => {
      alive = false;
    };
  }, [repo, loadNonce]);

  // Sériová fronta: zápisy v pořadí, chyba → opakování se stejným zápisem.
  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setSaveState('saving');
    let attempt = 0;
    let rejected = false;
    while (queue.current.length) {
      try {
        await queue.current[0].run();
        queue.current.shift();
        attempt = 0;
        setSaveState('saving');
      } catch (e) {
        if (isPermanent(e)) {
          // Opakování nepomůže: zápis zahodit, pokračovat a nakonec srovnat stav se serverem.
          queue.current.shift();
          attempt = 0;
          rejected = true;
          setSaveError(`Změnu se nepodařilo uložit (${userMessageOf(e)}). Zobrazuji data ze serveru.`);
          setSaveState('saving');
          continue;
        }
        setSaveState('retrying');
        await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
        attempt++;
      }
    }
    if (rejected) {
      try {
        setData(await repo.loadAll());
      } catch {
        /* necháme lokální stav; další načtení to srovná */
      }
    }
    running.current = false;
    setSaveState('idle');
  }, [repo]);

  const enqueue = useCallback(
    (op: () => Promise<void>, key?: string) => {
      queue.current.push({ run: op, key });
      void pump();
    },
    [pump],
  );

  /** Čeká na uložení vlastní změna s tímto klíčem (ve frontě nebo odložená)? */
  const busy = useCallback((key: string) => timers.current.has(key) || queue.current.some((e) => e.key === key), []);

  /** Po výpadku spojení / návratu do appky: dorovnat se serverem (Realtime zmeškané změny neposílá). */
  const resync = useCallback(() => {
    repo.loadAll().then(
      (r) => setData((d) => mergeRemote(d, r, busy)),
      () => {
        /* další pokus při příštím připojení */
      },
    );
  }, [repo, busy]);

  // Živé změny od ostatních telefonů (ťuknutí jiných hráčů, zamčená kola, nové tréninky).
  useEffect(() => {
    if (status !== 'ready') return;
    return repo.subscribe({
      score: (tid, mid, s) => {
        if (busy(pendingKey.score(tid, mid))) return; // ozvěna staršího stavu, vlastní ťuknutí ještě čekají
        setData((d) => ({
          ...d,
          trainings: d.trainings.map((t) => {
            if (t.id !== tid) return t;
            const scores = { ...t.scores };
            if (s) scores[mid] = s;
            else delete scores[mid];
            return { ...t, scores };
          }),
        }));
      },
      solo: (tid, pid, key, value, attempts) => {
        if (busy(pendingKey.solo(tid, pid, key))) return;
        setData((d) => ({
          ...d,
          trainings: d.trainings.map((t) => (t.id === tid ? setAttempts(setSolo(t, pid, key, value), pid, key, value === null ? null : (attempts ?? null)) : t)),
        }));
      },
      training: (t, id) =>
        setData((d) => {
          const pending = busy(pendingKey.training(id));
          if (!t) return pending ? d : { ...d, trainings: d.trainings.filter((x) => x.id !== id) };
          const cur = d.trainings.find((x) => x.id === id);
          const merged = cur ? mergeTrainingEcho(cur, t, pending) : t;
          return { ...d, trainings: cur ? d.trainings.map((x) => (x.id === id ? merged : x)) : [...d.trainings, merged] };
        }),
      playTime: (tid, itemId, p) => {
        if (busy(pendingKey.time(tid, itemId))) return;
        setData((d) => ({ ...d, trainings: d.trainings.map((t) => (t.id === tid ? withPlayTime(t, itemId, p) : t)) }));
      },
      resync,
    });
  }, [repo, status, busy, resync]);

  // Telefon se zamčenou obrazovkou / appka na pozadí: po návratu dorovnat.
  useEffect(() => {
    if (status !== 'ready') return;
    const on = () => document.visibilityState === 'visible' && resync();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [status, resync]);

  // Varování při zavření stránky s neuloženými změnami.
  useEffect(() => {
    const on = (e: BeforeUnloadEvent) => {
      if (queue.current.length || timers.current.size) e.preventDefault();
    };
    window.addEventListener('beforeunload', on);
    return () => window.removeEventListener('beforeunload', on);
  }, []);

  /** Zruší čekající (debounce) zápisy skóre tréninku, které nemají přežít. */
  const cancelPending = useCallback((trainingId: string, keep: (t: Training | null) => (rest: string) => boolean, t: Training | null) => {
    const k = keep(t);
    for (const [key, timer] of timers.current) {
      const prefix = `${trainingId}::`;
      if (key.startsWith(prefix) && !k(key.slice(prefix.length))) {
        clearTimeout(timer);
        timers.current.delete(key);
      }
    }
  }, []);

  /** Ponechá čekající zápisy, které v novém stavu tréninku dávají smysl. */
  const stillValid = (t: Training | null) => (rest: string) => {
    if (!t) return false;
    if (rest.startsWith('solo::')) {
      const [, pid, metric] = rest.split('::');
      return t.soloResults[pid]?.[metric] !== undefined;
    }
    return rest in t.scores;
  };

  const debounce = useCallback(
    (key: string, op: () => Promise<void>) => {
      const prev = timers.current.get(key);
      if (prev) clearTimeout(prev);
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          enqueue(op, key);
        }, SCORE_DEBOUNCE_MS),
      );
    },
    [enqueue],
  );

  const actions = useMemo(
    () => ({
      reload: () => setLoadNonce((n) => n + 1),
      dismissSaveError: () => setSaveError(null),
      savePlayer: (p: Player) => {
        setData((d) => ({ ...d, players: upsert(d.players, p) }));
        enqueue(() => repo.savePlayer(p), pendingKey.players);
      },
      deletePlayer: (id: PlayerId) => {
        setData((d) => ({ ...d, players: d.players.filter((p) => p.id !== id) }));
        enqueue(() => repo.deletePlayer(id), pendingKey.players);
      },
      saveTraining: (t: Training) => {
        setData((d) => ({
          ...d,
          trainings: upsert(d.trainings, { ...t, scores: d.trainings.find((x) => x.id === t.id)?.scores ?? {} }),
        }));
        enqueue(() => repo.saveTraining(t), pendingKey.training(t.id));
      },
      updateTrainingConfig: (t: Training) => {
        cancelPending(t.id, stillValid, t);
        setData((d) => ({ ...d, trainings: upsert(d.trainings, t) }));
        const k = pendingKey.training(t.id);
        enqueue(() => repo.saveTraining(t), k);
        enqueue(() => repo.replaceScores(t.id, Object.keys(t.scores)), k);
        enqueue(() =>
          repo.replaceSolo(
            t.id,
            Object.entries(t.soloResults).flatMap(([playerId, ms]) =>
              Object.keys(ms).map((key) => ({ playerId, key, metric: parseSoloKey(key).metric })),
            ),
          ),
          k,
        );
      },
      bumpScore: (trainingId: string, match: Match, field: keyof Score, delta: number) => {
        setData((d) => ({
          ...d,
          trainings: d.trainings.map((t) =>
            t.id === trainingId ? { ...t, scores: { ...t.scores, [match.id]: bump(match, t.scores[match.id] ?? {}, field, delta) } } : t,
          ),
        }));
        enqueue(() => repo.bumpScore(trainingId, match.id, field, delta, bumpLimit(match, field)), pendingKey.score(trainingId, match.id));
      },
      tapSolo: (trainingId: string, playerId: PlayerId, key: SoloKey, def: SoloMetricDef, ok: boolean, delta: 1 | -1) => {
        setData((d) => ({
          ...d,
          trainings: d.trainings.map((t) => {
            if (t.id !== trainingId) return t;
            const next = tapDrill({ value: t.soloResults[playerId]?.[key], attempts: t.soloAttempts?.[playerId]?.[key] }, def, ok, delta);
            return next ? setAttempts(setSolo(t, playerId, key, next.value), playerId, key, next.attempts) : t;
          }),
        }));
        // Stejné meze hlídá i databáze (tap_solo), takže rychlé dvojité ťuknutí na hranici nic nepokazí.
        const dlt = tapDelta(def, ok, delta);
        enqueue(() => repo.tapSolo(trainingId, playerId, key, dlt.value, dlt.attempts, def.max), pendingKey.solo(trainingId, playerId, key));
      },
      bumpSolo: (trainingId: string, playerId: PlayerId, key: SoloKey, delta: number, max: number) => {
        setData((d) => ({
          ...d,
          trainings: d.trainings.map((t) => {
            if (t.id !== trainingId) return t;
            const cur = t.soloResults[playerId]?.[key] ?? 0;
            return setSolo(t, playerId, key, Math.min(max, Math.max(0, cur + delta)));
          }),
        }));
        enqueue(() => repo.bumpSolo(trainingId, playerId, key, delta, max), pendingKey.solo(trainingId, playerId, key));
      },
      setPlayTime: (trainingId: string, itemId: string, p: PlayTime | null) => {
        setData((d) => ({ ...d, trainings: d.trainings.map((t) => (t.id === trainingId ? withPlayTime(t, itemId, p) : t)) }));
        enqueue(() => repo.savePlayTime(trainingId, itemId, p), pendingKey.time(trainingId, itemId));
      },
      lockRounds: (t: Training) => {
        setData((d) => ({ ...d, trainings: d.trainings.map((x) => (x.id === t.id ? { ...x, lockedRounds: t.lockedRounds, simTeams: t.simTeams } : x)) }));
        enqueue(() => repo.lockRounds(t.id, t.lockedRounds, t.simTeams), pendingKey.training(t.id));
      },
      deleteTraining: (id: string) => {
        cancelPending(id, stillValid, null);
        setData((d) => ({ ...d, trainings: d.trainings.filter((t) => t.id !== id) }));
        enqueue(() => repo.deleteTraining(id), pendingKey.training(id));
      },
      saveScore: (trainingId: string, matchId: MatchId, s: Score) => {
        setData((d) => ({
          ...d,
          trainings: d.trainings.map((t) => {
            if (t.id !== trainingId) return t;
            const scores = { ...t.scores };
            if (isEmptyScore(s)) delete scores[matchId];
            else scores[matchId] = s;
            return { ...t, scores };
          }),
        }));
        debounce(pendingKey.score(trainingId, matchId), () => repo.saveScore(trainingId, matchId, s));
      },
      saveSolo: (trainingId: string, playerId: PlayerId, key: SoloKey, value: number | null) => {
        setData((d) => ({
          ...d,
          // Zapsáno číslem: pokusy se mažou (= dokončené cvičení).
          trainings: d.trainings.map((t) => (t.id === trainingId ? setAttempts(setSolo(t, playerId, key, value), playerId, key, null) : t)),
        }));
        debounce(pendingKey.solo(trainingId, playerId, key), () => repo.saveSolo(trainingId, playerId, key, value));
      },
      newId: newUuid,
    }),
    [repo, enqueue, cancelPending, debounce],
  );

  return { status, data, saveState, saveError, ...actions };
}
