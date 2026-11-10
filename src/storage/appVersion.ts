import { COMPAT } from '../version';

/** Verze nasazené appky: označení sestavení a kompatibilita (viz src/version.ts). */
export interface AppVersion {
  build: string;
  compat: number;
}

/**
 * current  – běží nejnovější verze (nebo se to nepodařilo zjistit);
 * update   – je nasazená jiná verze, stačí obnovit při příležitosti;
 * required – je nasazená verze, vedle které tahle nesmí běžet (jiný rozpis / databáze).
 */
export type VersionState = 'current' | 'update' | 'required';

export const myVersion: AppVersion = { build: __APP_BUILD__, compat: COMPAT };

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
    const { build, compat } = (v ?? {}) as Partial<AppVersion>;
    return typeof build === 'string' && typeof compat === 'number' ? { build, compat } : null;
  } catch {
    return null;
  }
}
