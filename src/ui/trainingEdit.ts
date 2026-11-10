import { reconcileTeams } from '../domain/simulation';
import { stalePlayTimes } from '../domain/queue';
import { buildSchedule, canBuildSchedule } from '../domain/schedule';
import { lostEntries, pruneEntries, replan, type LostEntries } from '../domain/training';
import type { Training } from '../domain/types';
import { plural } from './format';
import type { AppStore } from './useAppState';

/** Co změna smaže: „skóre u N zápasů a M výsledků sólové části (a časy u K utkání)“, nebo null. */
function lossParts(lost: LostEntries, times = 0): string | null {
  const n = lost.scores.length;
  const m = lost.solo.length;
  const parts: string[] = [];
  if (n) parts.push(`skóre u ${n} ${plural(n, 'zápasu', 'zápasů', 'zápasů')}`);
  if (m) parts.push(`${m} ${plural(m, 'výsledek', 'výsledky', 'výsledků')} sólové části`);
  if (times) parts.push(`změřené časy u ${times} ${plural(times, 'utkání', 'utkání', 'utkání')}`);
  return parts.length ? parts.join(' a ') : null;
}

export function lossMessage(lost: LostEntries): string | null {
  const parts = lossParts(lost);
  return parts && `Změna smaže ${parts}. Pokračovat?`;
}

/** Mění se rozpis? (datum a začátek rozpis nemění, ukládají se přes saveTraining) */
export const configChanged = (a: Training, b: Training) =>
  a.mode !== b.mode ||
  a.tables !== b.tables ||
  a.attendees.join() !== b.attendees.join() ||
  a.simSplit !== b.simSplit ||
  JSON.stringify(a.simTeams) !== JSON.stringify(b.simTeams) ||
  a.durationMin !== b.durationMin ||
  JSON.stringify(a.plan) !== JSON.stringify(b.plan) ||
  a.lockedRounds !== b.lockedRounds;

/** Jedna úprava nastavení: přeplánování kol a srovnání týmů simulace (PRD 4.6, 5.3). */
export function prepareEdit(before: Training, input: Training): Training {
  const changed = replan(before, input);
  if (changed.simSplit === 'manual')
    // Ruční týmy se jen srovnají s přítomnými.
    return changed.simTeams ? { ...changed, simTeams: reconcileTeams(changed.simTeams, changed.attendees) } : changed;
  // Změna sestavy odemkne zamčené týmy simulace (přepočítají se).
  if (configChanged(before, changed) && changed.simTeams === before.simTeams) return { ...changed, simTeams: null };
  return changed;
}

/** Uloží upravený trénink; když by změna smazala výsledky, zeptá se. Vrací, jestli se uložilo. */
export function commitEdit(store: AppStore, original: Training, next: Training, ask: (msg: string) => boolean = (m) => confirm(m)): boolean {
  const msg = lossMessage(lostEntries(original, next));
  if (msg && !ask(msg)) return false;
  if (configChanged(original, next)) store.updateTrainingConfig(pruneEntries(next));
  else store.saveTraining(next);
  return true;
}

/**
 * Běžící trénink (10. 11. 2026): změna nastavení přegeneruje celý rozpis – zamčená kola se zahodí, skóre,
 * výsledky a časy utkání, které v novém rozpisu nejsou, se smažou (s potvrzením). Zahájení tréninku zůstává.
 * Bez změny rozpisu (jen datum, začátek, pauzy) se uloží beze ztrát. Vrací, jestli se uložilo.
 */
export function commitRegenerate(store: AppStore, original: Training, edited: Training, ask: (msg: string) => boolean = (m) => confirm(m)): boolean {
  const kept = { ...edited, lockedRounds: original.lockedRounds };
  if (!configChanged(original, kept)) {
    store.saveTraining(kept);
    return true;
  }
  const next = pruneEntries({ ...edited, lockedRounds: [] });
  const stale = stalePlayTimes(original.playTimes, canBuildSchedule(next) ? buildSchedule(next) : null);
  const parts = lossParts(lostEntries(original, next), stale.length);
  if (!ask(`Trénink běží – celý rozpis se přegeneruje.${parts ? ` Smaže se ${parts}.` : ''} Pokračovat?`)) return false;
  store.updateTrainingConfig(next);
  for (const id of stale) store.setPlayTime(original.id, id, null);
  return true;
}
