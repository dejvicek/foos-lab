import { drillCount } from './drillTap';
import { legOver } from './legState';
import { drillItemId } from './queue';
import { soloKey, soloMetric } from './solo';
import type { Schedule, Training } from './types';

/**
 * Konec utkání po dohraném výsledku (10. 11. 2026, rozhodnutí uživatele): když je leg dohraný nebo jsou
 * odehrané všechny pokusy cvičení, čeká se na „Potvrdit konec“, nejdéle AUTO_END_MS – pak utkání skončí samo.
 * Konec = poslední ťuknutí + AUTO_END_MS (nezávisle na tom, kdy to kdo uvidí). Oprava výsledku odpočet zruší.
 */
export const AUTO_END_MS = 15_000;

/**
 * Kdy byl výsledek utkání dohraný: čas posledního ťuknutí (událost průběhu hry). null = výsledek není dohraný,
 * nebo je zapsaný bez ťukání (notebook, organizátor) – to potvrzuje člověk. Rozcvička výsledek nemá.
 */
export function finishedAt(t: Training, s: Schedule, itemId: string): number | null {
  const last = (t.events ?? []).filter((e) => e.itemId === itemId).reduce<number | null>((m, e) => (m === null || e.at > m ? e.at : m), null);
  if (last === null) return null;
  for (const sec of s.sections)
    for (const row of sec.rows)
      for (let j = 0; j < row.cells.length; j++) {
        const c = row.cells[j];
        if (!c) continue;
        if (c.type === 'match') {
          if (c.match.id === itemId) return legOver(c.match, t.scores[itemId]).over ? last : null;
        } else if (c.metric && drillItemId(row, j + 1, c.players) === itemId) {
          const def = soloMetric(c.metric);
          const key = soloKey(c.metric, c.soloRound);
          const done = c.players.every((p) => drillCount({ value: t.soloResults[p]?.[key], attempts: t.soloAttempts?.[p]?.[key] }, def).done);
          return done ? last : null;
        }
      }
  return null;
}

/** Za kolik ms utkání skončí samo (0 = už mělo), null = neskončí samo (nehraje se, je ukončené, výsledek není dohraný). */
export function autoEndIn(t: Training, s: Schedule, itemId: string, now: number): number | null {
  const pt = t.playTimes?.[itemId];
  if (pt?.startedAt === undefined || pt.endedAt !== undefined) return null;
  const f = finishedAt(t, s, itemId);
  return f === null ? null : Math.max(0, f + AUTO_END_MS - now);
}

/** Utkání, která už měla skončit sama, a čas jejich konce. */
export function dueAutoEnds(t: Training, s: Schedule, now: number): { id: string; startedAt: number; endedAt: number }[] {
  return Object.entries(t.playTimes ?? {}).flatMap(([id, pt]) => {
    if (autoEndIn(t, s, id, now) !== 0) return [];
    const endedAt = Math.max(finishedAt(t, s, id)! + AUTO_END_MS, pt.startedAt!);
    return [{ id, startedAt: pt.startedAt!, endedAt }];
  });
}
