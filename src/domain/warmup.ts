import { WARMUP_PHASES, WARMUP_PREP_SEC, type WarmupPhase } from './content';
import { drillItemId } from './queue';
import type { Schedule } from './types';

/** Stav timeru Rozcvičky v daném okamžiku (sekundy od zahájení). */
export type WarmupState =
  | { done: false; index: number; total: number; phase: WarmupPhase; prep: boolean; remainingSec: number; next: WarmupPhase | null }
  | { done: true; total: number };

/** Celá Rozcvička: fáze + příprava před každou (8:35). */
export const WARMUP_TOTAL_SEC = WARMUP_PHASES.reduce((s, p) => s + WARMUP_PREP_SEC + p.sec, 0);

export function warmupState(elapsedSec: number): WarmupState {
  const total = WARMUP_PHASES.length;
  const t = Math.max(0, elapsedSec);
  let start = 0;
  for (let index = 0; index < total; index++) {
    const phase = WARMUP_PHASES[index];
    const next = WARMUP_PHASES[index + 1] ?? null;
    const prepEnd = start + WARMUP_PREP_SEC;
    const end = prepEnd + phase.sec;
    if (t < prepEnd) return { done: false, index, total, phase, prep: true, remainingSec: Math.ceil(prepEnd - t), next };
    if (t < end) return { done: false, index, total, phase, prep: false, remainingSec: Math.ceil(end - t), next };
    start = end;
  }
  return { done: true, total };
}

export const rodName = (rod: WarmupPhase['rod']): string => (rod === 'twoBar' ? 'dvojka' : 'pětka');

/** Je utkání (id z fronty) skupina Rozcvičky? */
export function isWarmupItem(s: Schedule, itemId: string): boolean {
  for (const sec of s.sections)
    for (const row of sec.rows)
      for (const [j, c] of row.cells.entries())
        if (c?.type === 'group' && c.discipline === 'warmup' && drillItemId(row, j + 1, c.players) === itemId) return true;
  return false;
}
