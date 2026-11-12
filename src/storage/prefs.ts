import type { DisciplineId } from '../domain/types';
import type { LadderRange, LadderView } from '../domain/ladder';

/** practice = žebříček Vlastní (vlastní tréninky, PRD 5.11). */
export type LadderPart = 'matches' | 'solo' | 'practice' | 'delays';

export interface UiPrefs {
  ladderRange: LadderRange;
  ladderView: LadderView;
  ladderPart: LadderPart;
}

const KEY = 'foosball-practice.prefs.v1';
export const defaultPrefs = (): UiPrefs => ({ ladderRange: { kind: 'form' }, ladderView: 'avg', ladderPart: 'matches' });

function valid(p: unknown): p is UiPrefs {
  if (!p || typeof p !== 'object') return false;
  const { ladderRange: r, ladderView: v } = p as UiPrefs;
  if (v !== 'avg' && v !== 'total') return false;
  if (!r || typeof r !== 'object') return false;
  if (r.kind === 'form' || r.kind === 'all') return true;
  return r.kind === 'custom' && typeof r.from === 'string' && typeof r.to === 'string';
}

/** Nastavení zařízení (localStorage); nečitelné nebo chybějící → výchozí. */
export function loadPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (!valid(p)) return defaultPrefs();
    return { ...p, ladderPart: p.ladderPart === 'solo' || p.ladderPart === 'practice' || p.ladderPart === 'delays' ? p.ladderPart : 'matches' };
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(p: UiPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* bez uložení to běží dál */
  }
}

/** Zobrazení Průběhu (PRD 4.9): sloupec, nebo křivka; platí pro zápasy i cvičení, výchozí sloupec. */
export type TimelineView = 'column' | 'curve';

const TIMELINE_KEY = 'foosball-practice.timeline-view.v1';
const timelineListeners = new Set<() => void>();

export function loadTimelineView(): TimelineView {
  try {
    return localStorage.getItem(TIMELINE_KEY) === 'curve' ? 'curve' : 'column';
  } catch {
    return 'column';
  }
}

/** Uloží volbu a dá vědět všem otevřeným průběhům (přepnou se najednou). */
export function saveTimelineView(v: TimelineView): void {
  try {
    localStorage.setItem(TIMELINE_KEY, v);
  } catch {
    /* bez uložení to běží dál */
  }
  timelineListeners.forEach((l) => l());
}

export function subscribeTimelineView(listener: () => void): () => void {
  timelineListeners.add(listener);
  return () => {
    timelineListeners.delete(listener);
  };
}

/** Barevný režim zvolený v zařízení; null = podle systému. Klíč čte i skript v index.html (bez probliknutí). */
export type Theme = 'light' | 'dark';
export const THEME_KEY = 'foosball-practice.theme.v1';

export function loadTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

export function saveTheme(t: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* bez uložení platí volba do zavření appky */
  }
}

/**
 * Vybraná cvičení vlastního tréninku v pořadí (PRD 5.11) – zařízení si je pamatuje pro příště, zvlášť
 * pro solo a duo (12. 11. 2026; dřívější společný seznam patří solu). null = ještě nic.
 */
export type PracticeMode = 'solo' | 'duo';
const PRACTICE_KEY: Record<PracticeMode, string> = { solo: 'foosball-practice.practice-drills.v1', duo: 'foosball-practice.practice-drills.duo.v1' };

export function loadPracticeDrills(mode: PracticeMode = 'solo'): DisciplineId[] | null {
  try {
    const raw = localStorage.getItem(PRACTICE_KEY[mode]);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as DisciplineId[]) : null;
  } catch {
    return null;
  }
}

export function savePracticeDrills(ids: DisciplineId[], mode: PracticeMode = 'solo'): void {
  try {
    localStorage.setItem(PRACTICE_KEY[mode], JSON.stringify(ids));
  } catch {
    /* bez uložení se příště začne výchozím výběrem */
  }
}
