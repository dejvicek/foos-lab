import type { AppData } from './repository';

/**
 * Poslední stav appky uložený v zařízení: po spuštění je na obrazovce hned (i na pomalém spojení nebo
 * bez něj) a ze serveru se pak dotáhnou jen změny od `cursor`.
 */
export interface Snapshot {
  data: AppData;
  /** Kurzor posledního načtení ze serveru (null = příště načíst všechno). */
  cursor: string | null;
  savedAt: number;
}

export interface SnapshotStore {
  load(): Promise<Snapshot | null>;
  save(s: Snapshot): Promise<void>;
  clear(): Promise<void>;
}

/** Průběh her se neukládá – je velký a načítá se znovu u otevřeného tréninku. */
export function withoutEvents(d: AppData): AppData {
  const { cursor: _, ...rest } = d;
  return { ...rest, trainings: d.trainings.map(({ events: _e, ...t }) => t) };
}

/** Uložený stav v paměti – testy. */
export function memorySnapshot(initial: Snapshot | null = null): SnapshotStore {
  let snap = initial ? structuredClone(initial) : null;
  return {
    load: async () => (snap ? structuredClone(snap) : null),
    save: async (s) => {
      snap = structuredClone(s);
    },
    clear: async () => {
      snap = null;
    },
  };
}

const DB = 'foos-lab';
const STORE = 'snapshots';
/** Zvyš, když se změní tvar uložených dat – starší uložený stav se pak nepoužije. */
const SHAPE = 1;

const valid = (x: unknown): x is Snapshot & { shape: number } => {
  const s = x as (Snapshot & { shape?: number }) | undefined;
  return !!s && s.shape === SHAPE && !!s.data && Array.isArray(s.data.players) && Array.isArray(s.data.trainings);
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Uložený stav v IndexedDB (localStorage by na rok tréninků nestačil), zvlášť pro každého přihlášeného
 * hráče. Když úložiště není nebo selže, appka běží dál jen bez rychlého startu – chyby se nehlásí.
 */
export function idbSnapshot(owner: string): SnapshotStore {
  const has = typeof indexedDB !== 'undefined';
  return {
    async load() {
      if (!has) return null;
      try {
        const v = await run<unknown>('readonly', (s) => s.get(owner));
        return valid(v) ? { data: v.data, cursor: v.cursor ?? null, savedAt: v.savedAt } : null;
      } catch {
        return null;
      }
    },
    async save(s) {
      if (!has) return;
      try {
        await run('readwrite', (st) => st.put({ ...s, shape: SHAPE }, owner));
      } catch {
        /* plné nebo zakázané úložiště */
      }
    },
    async clear() {
      if (!has) return;
      try {
        await run('readwrite', (st) => st.delete(owner));
      } catch {
        /* nic */
      }
    },
  };
}
