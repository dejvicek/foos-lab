import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isEmptyScore, setAttempts, setSolo } from '../domain/training';
import { tapDelta, tapDrill } from '../domain/drillTap';
import type { SoloMetricDef } from '../domain/solo';
import type { CatalogData } from '../domain/catalog';
import { bump, bumpLimit } from '../domain/legState';
import { parseSoloKey } from '../domain/solo';
import type { GameEvent, Match, MatchId, Player, PlayerId, PlayTime, Score, SoloKey, Training } from '../domain/types';
import { isPermanent, userMessageOf } from '../storage/errors';
import { configOf, mergeHead, opKey, runOp, type Op, type OpResult } from '../storage/ops';
import { freshOnly, noOutbox, type Outbox, type Queued } from '../storage/outbox';
import { withoutEvents, type SnapshotStore } from '../storage/snapshot';
import type { AppData, Repository } from '../storage/repository';
import { newUuid } from './ids';
import { applyChanges, mergeRemote, mergeTrainingEcho, pendingKey } from './merge';

export type Status = 'loading' | 'error' | 'ready';
export type SaveState = 'idle' | 'saving' | 'retrying';

export interface AppStore {
  status: Status;
  data: AppData;
  saveState: SaveState;
  /**
   * Bez spojení se serverem: poslední dorovnání se nepovedlo, nebo je odpojený odběr živých změn.
   * Na obrazovce je poslední známý stav; zápisy čekají ve frontě.
   */
  offline: boolean;
  /** Zpráva o zápisu, který server trvale odmítl (zahozen, data znovu načtena). */
  saveError: string | null;
  dismissSaveError(): void;
  reload(): void;
  savePlayer(p: Player): void;
  deletePlayer(id: PlayerId): void;
  /** Katalog disciplín a štítků (admin). */
  saveCatalog(c: CatalogData): void;
  /** Jen konfigurace tréninku; skóre nemění. */
  saveTraining(t: Training): void;
  /** Konfigurace + smazání skóre zápasů, které v `t.scores` nejsou (po pruneEntries). */
  updateTrainingConfig(t: Training): void;
  deleteTraining(id: string): void;
  /**
   * Ťuknutí na zápas: lokálně hned; do databáze jako přičtení spolu s událostí průběhu hry (jeden zápis,
   * který jde po chybě sítě bezpečně opakovat – souběžné telefony se nepřepíšou, nic se nezapočítá dvakrát).
   * Ťuknutí, které nic nezmění (strop legu, nula), se neposílá.
   */
  bumpScore(trainingId: string, match: Match, field: keyof Score, delta: number): void;
  /** Pokus cvičení (✓ / ✗, delta −1 = zpět) u stolu `itemId`: výsledek, počet pokusů i událost jedním zápisem. */
  tapSolo(trainingId: string, playerId: PlayerId, key: SoloKey, def: SoloMetricDef, ok: boolean, delta: 1 | -1, itemId: string): void;
  /** Zahájení utkání (teď). Čas se zapíše, jen když ještě není – dohrané utkání znovu neotevře. */
  startItem(trainingId: string, itemId: string): void;
  /**
   * Konec utkání (výchozí teď). `startedAt` se použije, když utkání zahájené nebylo
   * (organizátor potvrzuje bez zahájení). Už zapsaný konec ani zahájení se nepřepíšou.
   */
  endItem(trainingId: string, itemId: string, times?: { startedAt?: number; endedAt?: number }): void;
  /** Celý řádek časů utkání – jen mazání (null) a opravy; Zahájit / Ukončit jde přes startItem / endItem. */
  setPlayTime(trainingId: string, itemId: string, p: PlayTime | null): void;
  /**
   * Průběh her (události ťuknutí) se načítá jen tréninku, který je na obrazovce – a znovu při každém dorovnání.
   * Vrací funkci, která sledování ukončí.
   */
  watchEvents(trainingId: string): () => void;
  /** Všechna data včetně průběhu všech her (záloha) – čte se ze serveru. */
  loadBackup(): Promise<AppData>;
  /** Hráč: zamčení kol a týmů simulace přes funkci na serveru (nemá právo měnit trénink). */
  lockRounds(t: Training): void;
  /** Lokálně hned, do úložiště s odstupem SCORE_DEBOUNCE_MS za zápas. */
  saveScore(trainingId: string, matchId: MatchId, s: Score): void;
  /** Výsledek sólové části: lokálně hned, do úložiště s odstupem. null maže. */
  saveSolo(trainingId: string, playerId: PlayerId, key: SoloKey, value: number | null): void;
  newId(): string;
}

export const RETRY_DELAYS_MS = [2000, 5000, 10000];
/** Jak dlouho se při startu čeká na připojení odběru živých změn, než se data načtou i bez něj. */
export const LOAD_WAIT_MS = 3000;
/** Za jak dlouho po změně se stav uloží do zařízení (série ťuknutí = jedno uložení). */
export const SNAPSHOT_DELAY_MS = 1500;
export const SCORE_DEBOUNCE_MS = 400;


/** Zapíše / smaže čas utkání v tréninku (prázdný seznam časů se neuchovává). */
function withPlayTime(t: Training, itemId: string, p: PlayTime | null): Training {
  const times = { ...t.playTimes };
  if (!p || (p.startedAt === undefined && p.endedAt === undefined)) delete times[itemId];
  else times[itemId] = p;
  const { playTimes: _, ...rest } = t;
  return Object.keys(times).length ? { ...rest, playTimes: times } : rest;
}

/** Přidá událost hry, pokud ji trénink ještě nemá (ozvěna vlastní události se nezdvojí). */
function withEvent(t: Training, e: GameEvent): Training {
  if (t.events?.some((x) => x.id === e.id)) return t;
  return { ...t, events: [...(t.events ?? []), e] };
}

const inTraining = (d: AppData, id: string, fn: (t: Training) => Training): AppData => ({
  ...d,
  trainings: d.trainings.map((t) => (t.id === id ? fn(t) : t)),
});

/** Převezme stav po zápisu vrácený serverem. */
function withResult(d: AppData, r: OpResult): AppData {
  return inTraining(d, r.trainingId, (t) => {
    if (r.kind === 'score') {
      const scores = { ...t.scores };
      if (isEmptyScore(r.score)) delete scores[r.matchId];
      else scores[r.matchId] = r.score;
      return { ...t, scores };
    }
    if (r.kind === 'solo') return setAttempts(setSolo(t, r.playerId, r.key, r.value), r.playerId, r.key, r.attempts);
    return withPlayTime(t, r.itemId, r.time);
  });
}

const upsert = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

export function useAppState(
  repo: Repository,
  opts: { loadWaitMs?: number; outbox?: Outbox; snapshot?: SnapshotStore; snapshotDelayMs?: number } = {},
): AppStore {
  const loadWaitMs = opts.loadWaitMs ?? LOAD_WAIT_MS;
  /** Poslední stav uložený v zařízení: po spuštění je vidět hned, ze serveru se dotáhnou změny. (Stálý objekt – jeho výměna spustí načtení znovu.) */
  const snapshot = opts.snapshot;
  const snapshotDelayMs = opts.snapshotDelayMs ?? SNAPSHOT_DELAY_MS;
  /** Fronta zápisů uložená v zařízení – neodeslané zápisy přežijí zavření appky. */
  const outbox = opts.outbox ?? noOutbox;
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<AppData>({ players: [], trainings: [] });
  /** Aktuální stav i mezi vykresleními: dvě rychlá ťuknutí po sobě počítají s výsledkem toho prvního. */
  const dataRef = useRef(data);
  const update = useCallback((fn: (d: AppData) => AppData) => {
    dataRef.current = fn(dataRef.current);
    setData(dataRef.current);
  }, []);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [loadNonce, setLoadNonce] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [liveDown, setLiveDown] = useState(false);

  /** Fronta zápisů (data, ne funkce); klíč zápisu říká, čeho se týká – ozvěny ze serveru ho do uložení nepřepíšou. */
  const queue = useRef<Queued[]>([]);
  const running = useRef(false);
  /** Appka (tato instance) skončila – fronta se dál neposílá, zůstává uložená v zařízení. */
  const stopped = useRef(false);
  /** Fronta obsahovala zápisy z minulého spuštění: po odeslání se stav srovná se serverem. */
  const restored = useRef(false);
  const persist = useCallback(() => outbox.save(queue.current), [outbox]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Ukončí čekání před dalším pokusem (spojení se vrátilo). */
  const wake = useRef<(() => void) | null>(null);

  /** Čeká na uložení vlastní změna s tímto klíčem (ve frontě nebo odložená)? */
  const busy = useCallback((key: string) => timers.current.has(key) || queue.current.some((q) => opKey(q.op) === key), []);

  /** Tréninky na obrazovce (a kolikrát) – jen těm se načítá průběh her. */
  const watched = useRef(new Map<string, number>());
  const fetchEvents = useCallback(
    (trainingId: string) => {
      repo.loadEvents(trainingId).then(
        (events) =>
          update((d) =>
            inTraining(d, trainingId, (t) => {
              // Server + vlastní události, které ještě neodešly.
              const known = new Set(events.map((e) => e.id));
              const all = [...events, ...(t.events ?? []).filter((e) => !known.has(e.id))];
              return all.length ? { ...t, events: all } : t;
            }),
          ),
        () => {
          /* další dorovnání to zkusí znovu */
        },
      );
    },
    [repo, update],
  );

  const loaded = useRef(false);
  const syncing = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  /** Kurzor z posledního načtení: další dorovnání se ptá jen na změny od něj. */
  const cursor = useRef<string | null>(null);
  /** Příští dorovnání načte všechno (lokální stav se rozešel se serverem – odmítnutý zápis). */
  const fullNext = useRef(false);
  /** Data už přišla ze serveru (ne jen z uloženého stavu v zařízení). */
  const fromServer = useRef(false);
  /** Živé změny, které dorazily během načítání: po načtení se uplatní znovu (jsou novější než načtený snímek). */
  const late = useRef<(() => void)[] | null>(null);

  /**
   * Načtení dat ze serveru a sloučení s lokálním stavem (server vyhrává kromě vlastních neuložených změn).
   * Běží vždy jen jedno; další žádost se k němu připojí. `rerun` = po doběhnutí načíst ještě jednou
   * (běžící načtení mohlo začít dřív než událost, kvůli které se dorovnává). Poprvé se načte všechno,
   * potom jen změny od kurzoru; `full` vynutí kompletní načtení.
   */
  const sync = useCallback(
    (rerun: boolean, full = false): Promise<void> => {
      if (full) fullNext.current = true;
      if (syncing.current) {
        if (rerun || full) again.current = true;
        return syncing.current;
      }
      const run = async () => {
        do {
          again.current = false;
          late.current = [];
          try {
            const since = fullNext.current ? null : cursor.current;
            fullNext.current = false;
            const res = since ? await repo.loadChanges(since) : { full: await repo.loadAll() };
            const replay = late.current;
            if ('full' in res) {
              update((d) => mergeRemote(d, res.full, busy));
              cursor.current = res.full.cursor ?? null;
            } else {
              update((d) => applyChanges(d, res.changes, busy));
              cursor.current = res.changes.cursor;
            }
            for (const apply of replay) apply();
            loaded.current = true;
            fromServer.current = true;
            setSyncFailed(false);
            setStatus('ready');
            for (const id of watched.current.keys()) fetchEvents(id);
          } catch {
            // Chyba je jen u prvního načtení; později zůstávají data na obrazovce a zkusí to další dorovnání.
            if (!loaded.current) setStatus('error');
            setSyncFailed(true);
          } finally {
            late.current = null;
          }
        } while (again.current);
      };
      syncing.current = run().finally(() => {
        syncing.current = null;
      });
      return syncing.current;
    },
    [repo, busy, update, fetchEvents],
  );

  // Sériová fronta: zápisy v pořadí, chyba → opakování se stejným zápisem.
  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setSaveState('saving');
    let attempt = 0;
    let rejected = false;
    while (queue.current.length && !stopped.current) {
      // Ťuknutí, která se ve frontě nahromadila pro tentýž zápas / cvičení, odejdou jedním zápisem.
      const { op, count } = mergeHead(queue.current.map((q) => q.op));
      try {
        const result = await runOp(repo, op);
        queue.current.splice(0, count);
        persist();
        // Stav ze serveru platí, jakmile k témuž nečeká další vlastní zápis.
        if (result && !busy(opKey(op))) update((d) => withResult(d, result));
        attempt = 0;
        setSaveState('saving');
      } catch (e) {
        if (isPermanent(e)) {
          // Opakování nepomůže: zápis zahodit, pokračovat a nakonec srovnat stav se serverem.
          queue.current.splice(0, count);
          persist();
          attempt = 0;
          rejected = true;
          if (op.kind === 'tapScore' || op.kind === 'tapDrill') {
            // Odmítnuté ťuknutí nenechá stopu ani v průběhu hry.
            const ids = new Set(op.taps.map((x) => x.id));
            update((d) =>
              inTraining(d, op.trainingId, (t) => {
                if (!t.events) return t;
                const { events, ...rest } = t;
                const kept = events.filter((x) => !ids.has(x.id));
                return kept.length ? { ...rest, events: kept } : rest;
              }),
            );
          }
          setSaveError(`Změnu se nepodařilo uložit (${userMessageOf(e)}). Zobrazuji data ze serveru.`);
          setSaveState('saving');
          continue;
        }
        setSaveState('retrying');
        // Další pokus po prodlevě, nebo hned, jakmile se vrátí spojení.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(done, RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
          function done() {
            clearTimeout(timer);
            wake.current = null;
            resolve();
          }
          wake.current = done;
        });
        attempt++;
      }
    }
    if ((rejected || restored.current) && !stopped.current) {
      // Odmítnutý zápis: lokální stav se rozešel se serverem, změny od kurzoru by ho nesrovnaly.
      const full = rejected;
      restored.current = false;
      await sync(true, full);
    }
    running.current = false;
    setSaveState('idle');
  }, [repo, update, sync, busy, persist]);

  const enqueue = useCallback(
    (op: Op) => {
      queue.current.push({ op, at: Date.now() });
      persist();
      void pump();
    },
    [pump, persist],
  );

  // Zápisy, které minule nestihly odejít (appka zavřená bez spojení), se odešlou teď.
  useEffect(() => {
    stopped.current = false;
    if (!queue.current.length) {
      const { fresh, stale } = freshOnly(outbox.load(), Date.now());
      if (stale) {
        setSaveError(`Neodeslané změny z minula (${stale}) jsou starší než den a už se neodešlou.`);
        outbox.save(fresh);
      }
      if (fresh.length) {
        queue.current = fresh;
        restored.current = true;
      }
    }
    if (queue.current.length) void pump();
    return () => {
      stopped.current = true;
      wake.current?.();
    };
  }, [outbox, pump]);

  // Živé změny od ostatních telefonů (ťuknutí jiných hráčů, zamčená kola, nové tréninky) a načtení dat.
  // Odběr se přihlásí hned a data se načtou až po jeho připojení: změny mezi načtením a připojením by se
  // jinak ztratily a muselo by se načítat dvakrát. Když se odběr do loadWaitMs nepřipojí, načte se i tak.
  // Stejná cesta slouží i po výpadku spojení (Realtime zmeškané změny neposílá).
  useEffect(() => {
    setStatus('loading');
    loaded.current = false;
    fromServer.current = false;
    cursor.current = null;
    let alive = true;
    // Uložený stav ze zařízení hned na obrazovku; server ho pak dorovná (jen o změny od uloženého kurzoru).
    void snapshot?.load().then((snap) => {
      if (!alive || !snap || fromServer.current) return; // server byl rychlejší – starší stav už není potřeba
      update(() => snap.data);
      cursor.current = snap.cursor;
      loaded.current = true;
      setStatus('ready');
    });
    const timer = setTimeout(() => void sync(true), loadWaitMs);
    // Změna, která dorazí během načítání, se uplatní hned a po načtení ještě jednou.
    const live =
      <A extends unknown[]>(fn: (...a: A) => void) =>
      (...a: A): void => {
        late.current?.push(() => fn(...a));
        fn(...a);
      };
    const off = repo.subscribe({
      score: live((tid, mid, s) => {
        if (busy(pendingKey.score(tid, mid))) return; // ozvěna staršího stavu, vlastní ťuknutí ještě čekají
        update((d) =>
          inTraining(d, tid, (t) => {
            const scores = { ...t.scores };
            if (s) scores[mid] = s;
            else delete scores[mid];
            return { ...t, scores };
          }),
        );
      }),
      solo: live((tid, pid, key, value, attempts) => {
        if (busy(pendingKey.solo(tid, pid, key))) return;
        update((d) => inTraining(d, tid, (t) => setAttempts(setSolo(t, pid, key, value), pid, key, value === null ? null : (attempts ?? null))));
      }),
      training: live((t, id) =>
        update((d) => {
          const pending = busy(pendingKey.training(id));
          if (!t) return pending ? d : { ...d, trainings: d.trainings.filter((x) => x.id !== id) };
          const cur = d.trainings.find((x) => x.id === id);
          const merged = cur ? mergeTrainingEcho(cur, t, pending) : t;
          return { ...d, trainings: cur ? d.trainings.map((x) => (x.id === id ? merged : x)) : [...d.trainings, merged] };
        }),
      ),
      playTime: live((tid, itemId, p) => {
        if (busy(pendingKey.time(tid, itemId))) return;
        update((d) => inTraining(d, tid, (t) => withPlayTime(t, itemId, p)));
      }),
      event: live((tid, e) => update((d) => inTraining(d, tid, (t) => withEvent(t, e)))),
      resync: () => {
        clearTimeout(timer);
        void sync(true);
      },
      live: (connected) => alive && setLiveDown(!connected),
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      off();
    };
  }, [repo, loadNonce, loadWaitMs, sync, busy, update, snapshot]);

  // Stav se průběžně ukládá do zařízení (až když je co ukládat) a hned při odchodu z appky.
  useEffect(() => {
    if (!snapshot || !loaded.current) return;
    const save = () => void snapshot.save({ data: withoutEvents(dataRef.current), cursor: cursor.current, savedAt: Date.now() });
    const timer = setTimeout(save, snapshotDelayMs);
    const onHide = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [snapshot, snapshotDelayMs, data, status]);

  // Telefon se zamčenou obrazovkou / appka na pozadí: po návratu dorovnat.
  useEffect(() => {
    const on = () => {
      if (document.visibilityState === 'visible' && loaded.current) void sync(false);
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [sync]);

  // Spojení se vrátilo: čekající zápis zopakovat hned.
  useEffect(() => {
    const on = () => wake.current?.();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, []);

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

  /** Odložený zápis (psaní čísla): do fronty jde až poslední hodnota po SCORE_DEBOUNCE_MS. */
  const debounce = useCallback(
    (op: Op) => {
      const key = opKey(op);
      const prev = timers.current.get(key);
      if (prev) clearTimeout(prev);
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          enqueue(op);
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
        update((d) => ({ ...d, players: upsert(d.players, p) }));
        enqueue({ kind: 'savePlayer', player: p });
      },
      saveCatalog: (c: CatalogData) => {
        update((d) => ({ ...d, catalog: c }));
        enqueue({ kind: 'saveCatalog', catalog: c });
      },
      deletePlayer: (id: PlayerId) => {
        update((d) => ({ ...d, players: d.players.filter((p) => p.id !== id) }));
        enqueue({ kind: 'deletePlayer', id });
      },
      saveTraining: (t: Training) => {
        update((d) => ({
          ...d,
          trainings: upsert(d.trainings, { ...t, scores: d.trainings.find((x) => x.id === t.id)?.scores ?? {} }),
        }));
        enqueue({ kind: 'saveTraining', training: configOf(t) });
      },
      updateTrainingConfig: (t: Training) => {
        cancelPending(t.id, stillValid, t);
        update((d) => ({ ...d, trainings: upsert(d.trainings, t) }));
        enqueue({ kind: 'saveTraining', training: configOf(t) });
        enqueue({ kind: 'replaceScores', trainingId: t.id, keep: Object.keys(t.scores) });
        enqueue({
          kind: 'replaceSolo',
          trainingId: t.id,
          keep: Object.entries(t.soloResults).flatMap(([playerId, ms]) => Object.keys(ms).map((key) => ({ playerId, key, metric: parseSoloKey(key).metric }))),
        });
      },
      bumpScore: (trainingId: string, match: Match, field: keyof Score, delta: number) => {
        const t = dataRef.current.trainings.find((x) => x.id === trainingId);
        if (!t) return;
        const cur = t.scores[match.id] ?? {};
        const next = bump(match, cur, field, delta);
        if ((next[field] ?? 0) === (cur[field] ?? 0)) return; // strop / nula: nic se nemění, nic se neposílá
        const goal = field === 'ga' || field === 'gb';
        const e: GameEvent = { id: newUuid(), itemId: match.id, at: Date.now(), kind: goal ? 'goal' : 'loss', side: field === 'ga' || field === 'la' ? 'A' : 'B', delta: delta > 0 ? 1 : -1 };
        update((d) => inTraining(d, trainingId, (x) => withEvent({ ...x, scores: { ...x.scores, [match.id]: next } }, e)));
        // Stejný strop hlídá i databáze (tap_score), takže dva telefony na posledním gólu neudělají 7:4.
        enqueue({ kind: 'tapScore', trainingId, matchId: match.id, taps: [{ id: e.id, at: e.at, field, delta, max: bumpLimit(match, field) }] });
      },
      tapSolo: (trainingId: string, playerId: PlayerId, key: SoloKey, def: SoloMetricDef, ok: boolean, delta: 1 | -1, itemId: string) => {
        const t = dataRef.current.trainings.find((x) => x.id === trainingId);
        if (!t) return;
        const next = tapDrill({ value: t.soloResults[playerId]?.[key], attempts: t.soloAttempts?.[playerId]?.[key] }, def, ok, delta);
        if (!next) return; // všechny pokusy odehrané / není co vracet
        const e: GameEvent = { id: newUuid(), itemId, at: Date.now(), kind: ok ? 'hit' : 'miss', playerId, delta };
        update((d) => inTraining(d, trainingId, (x) => withEvent(setAttempts(setSolo(x, playerId, key, next.value), playerId, key, next.attempts), e)));
        // Stejné meze hlídá i databáze (tap_drill), takže rychlé dvojité ťuknutí na hranici nic nepokazí.
        const dlt = tapDelta(def, ok, delta);
        enqueue({ kind: 'tapDrill', trainingId, playerId, key, max: def.max, taps: [{ id: e.id, at: e.at, itemId, ok, delta, dValue: dlt.value, dAttempts: dlt.attempts }] });
      },
      startItem: (trainingId: string, itemId: string) => {
        const at = Date.now();
        update((d) =>
          inTraining(d, trainingId, (t) => {
            const cur = t.playTimes?.[itemId];
            return cur?.startedAt !== undefined ? t : withPlayTime(t, itemId, { ...cur, startedAt: at });
          }),
        );
        enqueue({ kind: 'startItem', trainingId, itemId, at });
      },
      endItem: (trainingId: string, itemId: string, times: { startedAt?: number; endedAt?: number } = {}) => {
        const endedAt = times.endedAt ?? Date.now();
        const fallback = times.startedAt === undefined ? undefined : Math.min(times.startedAt, endedAt);
        update((d) =>
          inTraining(d, trainingId, (t) => {
            const cur = t.playTimes?.[itemId] ?? {};
            const startedAt = cur.startedAt ?? fallback;
            return withPlayTime(t, itemId, { ...(startedAt !== undefined ? { startedAt } : {}), endedAt: cur.endedAt ?? endedAt });
          }),
        );
        enqueue({ kind: 'endItem', trainingId, itemId, ...(fallback !== undefined ? { startedAt: fallback } : {}), endedAt });
      },
      setPlayTime: (trainingId: string, itemId: string, p: PlayTime | null) => {
        update((d) => inTraining(d, trainingId, (t) => withPlayTime(t, itemId, p)));
        enqueue({ kind: 'savePlayTime', trainingId, itemId, time: p });
      },
      lockRounds: (t: Training) => {
        update((d) => inTraining(d, t.id, (x) => ({ ...x, lockedRounds: t.lockedRounds, simTeams: t.simTeams })));
        enqueue({ kind: 'lockRounds', trainingId: t.id, locked: t.lockedRounds, simTeams: t.simTeams });
      },
      deleteTraining: (id: string) => {
        cancelPending(id, stillValid, null);
        update((d) => ({ ...d, trainings: d.trainings.filter((t) => t.id !== id) }));
        enqueue({ kind: 'deleteTraining', id });
      },
      saveScore: (trainingId: string, matchId: MatchId, s: Score) => {
        update((d) =>
          inTraining(d, trainingId, (t) => {
            const scores = { ...t.scores };
            if (isEmptyScore(s)) delete scores[matchId];
            else scores[matchId] = s;
            return { ...t, scores };
          }),
        );
        debounce({ kind: 'saveScore', trainingId, matchId, score: s });
      },
      saveSolo: (trainingId: string, playerId: PlayerId, key: SoloKey, value: number | null) => {
        // Zapsáno číslem: pokusy se mažou (= dokončené cvičení).
        update((d) => inTraining(d, trainingId, (t) => setAttempts(setSolo(t, playerId, key, value), playerId, key, null)));
        debounce({ kind: 'saveSolo', trainingId, playerId, key, value });
      },
      watchEvents: (trainingId: string) => {
        watched.current.set(trainingId, (watched.current.get(trainingId) ?? 0) + 1);
        fetchEvents(trainingId);
        return () => {
          const n = (watched.current.get(trainingId) ?? 1) - 1;
          if (n > 0) watched.current.set(trainingId, n);
          else watched.current.delete(trainingId);
        };
      },
      loadBackup: () => repo.loadBackup(),
      newId: newUuid,
    }),
    [repo, enqueue, cancelPending, debounce, update, fetchEvents],
  );

  return { status, data, saveState, saveError, offline: syncFailed || liveDown, ...actions };
}
