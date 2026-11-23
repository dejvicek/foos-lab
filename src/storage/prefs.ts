import type { DisciplineId } from '../domain/types';
import type { LadderRange, LadderView } from '../domain/ladder';
import type { MatchKindFilter } from '../domain/practice';
import type { ViewAs } from '../domain/my';

/**
 * Část žebříčku (18. 11. 2026, *rozhodnutí uživatele*): Zápasy · Cvičení · Zdržovači; Cvičení má podčásti
 * Týmové (`solo`, dřív Stanoviště) a Solo/Duo (`practice`, dřív Vlastní, PRD 5.11).
 */
export type LadderPart = 'matches' | 'solo' | 'practice' | 'delays';
export type LadderDrills = 'solo' | 'practice';

export interface UiPrefs {
  ladderRange: LadderRange;
  ladderView: LadderView;
  ladderPart: LadderPart;
  /** Naposledy zvolená podčást Cvičení – kam vede záložka Cvičení. */
  ladderDrills?: LadderDrills;
  /** Zápasy podle disciplín: 1 na 1 / 2 na 2 / vše (19. 11. 2026); chybí = vše. */
  ladderMatchKind?: MatchKindFilter;
  /** Stránka Tréninky: Klubové / Vlastní (19. 11. 2026); chybí = klubové. */
  trainingsPart?: 'club' | 'own';
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
    const { ladderDrills, ladderMatchKind, trainingsPart, ...rest } = p;
    return {
      ...rest,
      ladderPart: p.ladderPart === 'solo' || p.ladderPart === 'practice' || p.ladderPart === 'delays' ? p.ladderPart : 'matches',
      ...(ladderDrills === 'solo' || ladderDrills === 'practice' ? { ladderDrills } : {}),
      ...(ladderMatchKind === 'singles' || ladderMatchKind === 'doubles' || ladderMatchKind === 'all' ? { ladderMatchKind } : {}),
      ...(trainingsPart === 'club' || trainingsPart === 'own' ? { trainingsPart } : {}),
    };
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

/** Pohled admina jako jiná role (23. 11. 2026): pamatuje si ho zařízení; bez uložení admin. */
const VIEW_AS_KEY = 'foosball-practice.view-as.v1';

export function loadViewAs(): ViewAs {
  try {
    const v = localStorage.getItem(VIEW_AS_KEY);
    return v === 'organizer' || v === 'player' ? v : 'admin';
  } catch {
    return 'admin';
  }
}

export function saveViewAs(v: ViewAs): void {
  try {
    if (v === 'admin') localStorage.removeItem(VIEW_AS_KEY);
    else localStorage.setItem(VIEW_AS_KEY, v);
  } catch {
    /* bez uložení platí do zavření appky */
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

/**
 * Naposledy viděná verze patch notes (20. 11. 2026): po aktualizaci appka jednou ukáže, co je nového od ní.
 * Nastavení zařízení (localStorage); null = zařízení ještě nic nevidělo.
 */
export interface SeenVersionStore {
  load(): string | null;
  save(version: string): void;
}

export const SEEN_VERSION_KEY = 'foosball-practice.seen-version.v1';

export function localSeenVersion(): SeenVersionStore {
  return {
    load: () => {
      try {
        const v = localStorage.getItem(SEEN_VERSION_KEY);
        return v && /^\d+\.\d+\.\d+$/.test(v) ? v : null;
      } catch {
        return null;
      }
    },
    save: (v) => {
      try {
        localStorage.setItem(SEEN_VERSION_KEY, v);
      } catch {
        /* bez uložení se poznámky ukážou znovu příště */
      }
    },
  };
}

export function memorySeenVersion(initial: string | null = null): SeenVersionStore & { current(): string | null } {
  let v = initial;
  return { load: () => v, save: (x) => void (v = x), current: () => v };
}
