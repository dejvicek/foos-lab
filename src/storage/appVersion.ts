import { COMPAT } from '../version';

/** Verze nasazené appky: číslo pro lidi (1.0.0), označení sestavení a kompatibilita (viz src/version.ts). */
export interface AppVersion {
  /** Chybí u sestavení před verzí 1.0.0. */
  version?: string;
  build: string;
  compat: number;
}

/** Verze běžící appky, jak ji vidí hráč (hlavička). Zvyšuje se v package.json, změny v CHANGELOG.md. */
export const APP_VERSION = __APP_VERSION__;

/**
 * current  – běží nejnovější verze (nebo se to nepodařilo zjistit);
 * update   – je nasazená jiná verze, stačí obnovit při příležitosti;
 * required – je nasazená verze, vedle které tahle nesmí běžet (jiný rozpis / databáze).
 */
export type VersionState = 'current' | 'update' | 'required';

export const myVersion: AppVersion = { version: APP_VERSION, build: __APP_BUILD__, compat: COMPAT };

export function compareVersion(mine: AppVersion, latest: AppVersion | null): VersionState {
  if (!latest || latest.build === mine.build) return 'current';
  return latest.compat > mine.compat ? 'required' : 'update';
}

/**
 * Verze, která je právě nasazená: soubor version.json vedle appky (vzniká při sestavení).
 * Čte se mimo mezipaměť prohlížeče; bez spojení nebo s nečitelnou odpovědí vrací null.
 */
export async function fetchLatestVersion(fetchImpl: typeof fetch = fetch): Promise<AppVersion | null> {
  try {
    const res = await fetchImpl(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const v: unknown = await res.json();
    const { version, build, compat } = (v ?? {}) as Partial<AppVersion>;
    if (typeof build !== 'string' || typeof compat !== 'number') return null;
    return typeof version === 'string' ? { version, build, compat } : { build, compat };
  } catch {
    return null;
  }
}
