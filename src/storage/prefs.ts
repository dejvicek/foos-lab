import type { LadderRange, LadderView } from '../domain/ladder';

export type LadderPart = 'matches' | 'solo' | 'delays';

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
    return { ...p, ladderPart: p.ladderPart === 'solo' || p.ladderPart === 'delays' ? p.ladderPart : 'matches' };
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
