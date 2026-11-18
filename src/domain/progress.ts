/**
 * Průběh tréninku pro nadpis kola v Moje hry (18. 11. 2026, *rozhodnutí uživatele*): čára nahoře ukazuje
 * kola v čase (šířka podle délky, barva podle typu disciplíny), pauzy na svém místě a kde jsem teď.
 */
import { discipline } from './disciplines';
import type { Schedule, ScheduleRow } from './types';

/** Typ kola pro barvu: zápas, scénář, Zeď, Daň za ztrátu, simulace, cvičení. */
export type RoundType = 'normal' | 'scen' | 'wall' | 'tax' | 'sim' | 'drill';

export const ROUND_TYPE_NAME: Record<RoundType, string> = {
  normal: 'Zápas',
  scen: 'Scénář',
  wall: 'Zeď',
  tax: 'Daň za ztrátu',
  sim: 'Simulace',
  drill: 'Cvičení',
};

/** Typ kola z disciplíny (konfigurovatelný trénink), jinak z pravidel zápasu / skupin (klasický). */
export function rowType(row: ScheduleRow): RoundType {
  const d = row.discipline ? discipline(row.discipline) : undefined;
  if (d) {
    if (d.kind === 'sim') return 'sim';
    if (d.kind === 'drill') return 'drill';
    if (d.lossTax) return 'tax';
    if (d.wall) return 'wall';
    if (d.start) return 'scen';
    return 'normal';
  }
  const m = row.cells.find((c) => c?.type === 'match');
  if (m?.type === 'match') {
    if (m.match.block === 'sim') return 'sim';
    if (m.match.lossTax) return 'tax';
    if (m.match.wall) return 'wall';
    if (m.match.start) return 'scen';
    return 'normal';
  }
  return row.kind === 'groups' ? 'drill' : 'normal';
}

export interface ProgressSeg {
  kind: 'round' | 'break';
  /** Délka v minutách (do začátku dalšího řádku). */
  min: number;
  /** Začátek v minutách od začátku tréninku. */
  time: number;
  type?: RoundType;
  /** Pořadí hracího kola (0 = první), jen u kola. */
  index?: number;
  row: ScheduleRow;
}

/** Řádky rozpisu v pořadí: hrací kola a pauzy s délkou; poslední kolo do konce tréninku. */
export function trainingProgress(s: Schedule, durationMin?: number): ProgressSeg[] {
  const rows = s.sections.flatMap((sec) => sec.rows);
  let index = 0;
  return rows.map((row, i) => {
    const next = rows[i + 1];
    const prev = i > 0 ? row.time - rows[i - 1].time : 8;
    const min = Math.max(1, next ? next.time - row.time : durationMin && durationMin > row.time ? durationMin - row.time : prev);
    if (row.kind === 'break') return { kind: 'break', min, time: row.time, row };
    return { kind: 'round', min, time: row.time, type: rowType(row), index: index++, row };
  });
}

/** Další pauza po kole `current` (0 = první kolo): za kolik kol a jak dlouhá; null = už žádná. */
export function nextBreak(segs: ProgressSeg[], current: number): { afterRounds: number; min: number; time: number } | null {
  const pos = segs.findIndex((x) => x.kind === 'round' && x.index === current);
  for (let i = pos + 1; i < segs.length; i++) {
    const x = segs[i];
    if (x.kind === 'break') {
      const before = segs.slice(pos + 1, i).filter((y) => y.kind === 'round').length;
      return { afterRounds: before, min: x.min, time: x.time };
    }
  }
  return null;
}
