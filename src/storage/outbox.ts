import type { Op } from './ops';

/** Zápis čekající na odeslání a kdy vznikl (ms, hodiny zařízení). */
export interface Queued {
  op: Op;
  at: number;
}

/**
 * Odkládací fronta zápisů v zařízení: neodeslané zápisy přežijí zavření appky (telefon appku na pozadí
 * klidně ukončí) a po novém spuštění se odešlou. Zápisy jsou data a jdou opakovat (viz ops.ts).
 */
export interface Outbox {
  load(): Queued[];
  save(queue: Queued[]): void;
}

/**
 * Starší neodeslané zápisy se už neposílají: uložení celého řádku (nastavení tréninku, hráč, výsledek
 * číslem) by po dni mohlo přepsat novější data z jiného zařízení. Appka to uživateli oznámí.
 */
export const OUTBOX_MAX_AGE_MS = 24 * 3_600_000;

const KEY = 'foosball-practice.outbox.v1';

const valid = (x: unknown): x is Queued =>
  !!x && typeof x === 'object' && typeof (x as Queued).at === 'number' && !!(x as Queued).op && typeof (x as Queued).op.kind === 'string';

/** Fronta v localStorage, zvlášť pro každého přihlášeného hráče (zápisy jednoho se neodešlou pod účtem druhého). */
export function localOutbox(owner: string): Outbox {
  const key = `${KEY}.${owner}`;
  return {
    load() {
      try {
        const list: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
        return Array.isArray(list) ? list.filter(valid) : [];
      } catch {
        return [];
      }
    },
    save(queue) {
      try {
        if (queue.length) localStorage.setItem(key, JSON.stringify(queue));
        else localStorage.removeItem(key);
      } catch {
        /* plné nebo zakázané úložiště: fronta zůstane jen v paměti */
      }
    },
  };
}

/** Fronta v paměti – testy. */
export function memoryOutbox(initial: Queued[] = []): Outbox {
  let queue = structuredClone(initial);
  return {
    load: () => structuredClone(queue),
    save: (q) => {
      queue = structuredClone(q);
    },
  };
}

/** Bez ukládání (vývoj s daty v paměti, testy). */
export const noOutbox: Outbox = { load: () => [], save: () => {} };

/** Rozdělí načtenou frontu na zápisy k odeslání a příliš staré (jejich počet). */
export function freshOnly(queue: Queued[], now: number): { fresh: Queued[]; stale: number } {
  const fresh = queue.filter((q) => now - q.at <= OUTBOX_MAX_AGE_MS);
  return { fresh, stale: queue.length - fresh.length };
}
