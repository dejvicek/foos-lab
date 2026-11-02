import { reconcileTeams } from '../domain/simulation';
import { lostEntries, pruneEntries, replan, type LostEntries } from '../domain/training';
import type { Training } from '../domain/types';
import { plural } from './format';
import type { AppStore } from './useAppState';

export function lossMessage(lost: LostEntries): string | null {
  const n = lost.scores.length;
  const m = lost.solo.length;
  if (!n && !m) return null;
  const parts: string[] = [];
  if (n) parts.push(`skóre u ${n} ${plural(n, 'zápasu', 'zápasů', 'zápasů')}`);
  if (m) parts.push(`${m} ${plural(m, 'výsledek', 'výsledky', 'výsledků')} sólové části`);
  return `Změna smaže ${parts.join(' a ')}. Pokračovat?`;
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
