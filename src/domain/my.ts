import type { Cell, Match, PlayerId, Schedule, ScheduleRow, Training } from './types';

export interface Viewer {
  playerId: PlayerId | null;
  isAdmin: boolean;
}

export interface Assignment {
  row: ScheduleRow;
  role: 'play' | 'referee' | 'wait';
  /** Stůl (1…), u kterého hráč hraje nebo rozhoduje. */
  table?: number;
  match?: Match;
  group?: Extract<Cell, { type: 'group' }>;
}

/** Všechna hrací kola rozpisu a co v nich daný hráč dělá (PRD 4.7 „Můj stůl“). */
export function myAssignments(s: Schedule, playerId: PlayerId): Assignment[] {
  const out: Assignment[] = [];
  for (const sec of s.sections)
    for (const row of sec.rows) {
      if (row.kind === 'break') continue;
      let a: Assignment = { row, role: 'wait' };
      row.cells.forEach((c, j) => {
        if (!c) return;
        if (c.type === 'match') {
          if ([...c.match.sideA, ...c.match.sideB].includes(playerId)) a = { row, role: 'play', table: j + 1, match: c.match };
          else if (c.match.referee === playerId && a.role === 'wait') a = { row, role: 'referee', table: j + 1, match: c.match };
        } else if (c.players.includes(playerId)) a = { row, role: 'play', table: j + 1, group: c };
      });
      out.push(a);
    }
  return out;
}

const attends = (v: Viewer, t: Training) => v.playerId !== null && t.attendees.includes(v.playerId);

/** Admin nebo zakladatel tréninku: nastavení, mazání a zápis všech výsledků. */
export const canManage = (v: Viewer, t: Training): boolean => v.isAdmin || (!!t.createdBy && t.createdBy === v.playerId);

/** Smí zapsat skóre zápasu? (zrcadlí can_write_score v databázi) */
export function canWriteMatch(v: Viewer, m: Match, t: Training): boolean {
  if (canManage(v, t)) return true;
  if (!attends(v, t)) return false;
  if ([...m.sideA, ...m.sideB].includes(v.playerId!)) return true;
  return t.format === 'custom' && m.referee === v.playerId;
}

/** Smí zapsat výsledek cvičení hráče `playerId` ve skupině `group`? (zrcadlí can_write_solo) */
export function canWriteSolo(v: Viewer, group: PlayerId[], playerId: PlayerId, t: Training): boolean {
  if (canManage(v, t)) return true;
  if (!attends(v, t)) return false;
  if (playerId === v.playerId) return true;
  return t.format === 'custom' && group.includes(v.playerId!);
}
