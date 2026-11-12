import type { SoloMetricDef } from './solo';

/** Stav cvičení hráče: výsledek (metrika) a odehrané pokusy; pokusy chybí = zapsáno číslem = dokončeno. */
export interface DrillValue {
  value?: number;
  attempts?: number;
}

export interface DrillCount {
  value: number;
  attempts: number;
  /** Povedené pokusy (✓). U „méně = lépe“ (ztráty) jsou to pokusy bez ztráty. */
  hits: number;
  misses: number;
  done: boolean;
}

export function drillCount(v: DrillValue, def: SoloMetricDef): DrillCount {
  const value = v.value ?? 0;
  // Cvičení na čas: hotovo = série splněná (výsledek je čas); povedené / nepovedené ukazuje průběh (streak.ts).
  if (def.streak) return { value, attempts: v.attempts ?? 0, hits: 0, misses: 0, done: value > 0 };
  const attempts = v.attempts ?? (v.value !== undefined ? def.max : 0);
  const bad = def.lowerIsBetter ? value : attempts - value;
  return { value, attempts, hits: attempts - bad, misses: bad, done: attempts >= def.max };
}

/**
 * PRD 5.8: ťuknutí po pokusu. ✓ = povedený pokus, ✗ = nepovedený; delta −1 vrací pokus daného druhu.
 * Vrací null, když to nejde (všechny pokusy odehrané / žádný takový pokus k vrácení).
 */
export function tapDrill(v: DrillValue, def: SoloMetricDef, ok: boolean, delta: 1 | -1): { value: number; attempts: number } | null {
  const c = drillCount(v, def);
  if (delta > 0 && c.done) return null;
  if (delta < 0 && (ok ? c.hits : c.misses) <= 0) return null;
  // Metrika počítá ✓, u „méně = lépe“ ✗ (ztráty).
  const counts = ok !== def.lowerIsBetter;
  return { value: c.value + (counts ? delta : 0), attempts: c.attempts + delta };
}

/** Kolik se přičte k metrice a k pokusům (pro souběžné ťukání v databázi). */
export const tapDelta = (def: SoloMetricDef, ok: boolean, delta: 1 | -1) => ({ value: ok !== def.lowerIsBetter ? delta : 0, attempts: delta });
