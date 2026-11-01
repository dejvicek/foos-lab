import { sortedRoster } from './roster';
import { DEFAULT_START, parseSoloKey, soloSlots, type SoloSlot } from './solo';
import { buildSchedule, canBuildSchedule } from './schedule';
import type { MatchId, Player, PlayerId, Score, SoloKey, SoloResults, Training } from './types';

export function newTraining(id: string, today: string, last: Training | null): Training {
  return {
    id,
    date: today,
    startTime: last?.startTime ?? DEFAULT_START,
    mode: last?.mode ?? 'team',
    tables: last?.tables ?? 4,
    attendees: [],
    scores: {},
    soloResults: {},
    simSplit: last?.simSplit ?? 'performance',
    simTeams: null,
  };
}

/**
 * Zaškrtnutí / odškrtnutí přítomného. Nový hráč se vloží hned za posledního
 * přítomného, který je na soupisce před ním (jinak na začátek) – přítomní
 * v pořadí soupisky v něm zůstanou.
 */
export function toggleAttendee(t: Training, playerId: PlayerId, players: Player[]): Training {
  if (t.attendees.includes(playerId)) {
    return { ...t, attendees: t.attendees.filter((p) => p !== playerId) };
  }
  const order = sortedRoster(players).map((p) => p.id);
  const before = new Set(order.slice(0, Math.max(0, order.indexOf(playerId))));
  let insertAt = 0;
  t.attendees.forEach((p, i) => {
    if (before.has(p)) insertAt = i + 1;
  });
  const attendees = [...t.attendees];
  attendees.splice(insertAt, 0, playerId);
  return { ...t, attendees };
}

export function moveAttendee(t: Training, playerId: PlayerId, dir: -1 | 1): Training {
  const i = t.attendees.indexOf(playerId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= t.attendees.length) return t;
  const attendees = [...t.attendees];
  [attendees[i], attendees[j]] = [attendees[j], attendees[i]];
  return { ...t, attendees };
}

export function isEmptyScore(s: Score | undefined): boolean {
  return !s || [s.ga, s.gb, s.la, s.lb].every((v) => v === null || v === undefined);
}

function built(t: Training) {
  return canBuildSchedule(t) ? buildSchedule(t) : null;
}

const slotKey = (playerId: PlayerId, key: SoloKey) => `${playerId}::${key}`;

function soloKeys(t: Training): Set<string> {
  const s = built(t);
  return new Set(s ? soloSlots(s).map((x) => slotKey(x.playerId, x.key)) : []);
}

function matchIds(t: Training): Set<MatchId> {
  const s = built(t);
  return new Set(s ? s.matches.map((m) => m.id) : []);
}

function filledSolo(t: Training): SoloSlot[] {
  const out: SoloSlot[] = [];
  for (const [playerId, metrics] of Object.entries(t.soloResults))
    for (const [metric, v] of Object.entries(metrics))
      if (v !== null && v !== undefined) out.push({ playerId, key: metric, metric: parseSoloKey(metric).metric });
  return out;
}

export interface LostEntries {
  scores: MatchId[];
  solo: SoloSlot[];
}

/** Zapsané skóre a výsledky sólové části z `before`, které v rozpisu `after` nemají místo. */
export function lostEntries(before: Training, after: Training): LostEntries {
  const ids = matchIds(after);
  const keys = soloKeys(after);
  return {
    scores: Object.entries(before.scores)
      .filter(([id, s]) => !isEmptyScore(s) && !ids.has(id))
      .map(([id]) => id),
    solo: filledSolo(before).filter((x) => !keys.has(slotKey(x.playerId, x.key))),
  };
}

/** Nechá jen skóre a výsledky, které v rozpisu tréninku mají místo. */
export function pruneEntries(t: Training): Training {
  const ids = matchIds(t);
  const keys = soloKeys(t);
  const scores = Object.fromEntries(Object.entries(t.scores).filter(([id]) => ids.has(id)));
  const soloResults: SoloResults = {};
  for (const [p, metrics] of Object.entries(t.soloResults)) {
    const kept = Object.fromEntries(Object.entries(metrics).filter(([k]) => keys.has(slotKey(p, k))));
    if (Object.keys(kept).length) soloResults[p] = kept;
  }
  return { ...t, scores, soloResults };
}

export function setSolo(t: Training, playerId: PlayerId, key: SoloKey, value: number | null): Training {
  const mine = { ...t.soloResults[playerId] };
  if (value === null) delete mine[key];
  else mine[key] = value;
  const soloResults = { ...t.soloResults };
  if (Object.keys(mine).length) soloResults[playerId] = mine;
  else delete soloResults[playerId];
  return { ...t, soloResults };
}

export function setScore(t: Training, id: MatchId, field: keyof Score, value: number | null): Training {
  return { ...t, scores: { ...t.scores, [id]: { ...t.scores[id], [field]: value } } };
}

export function sortTrainings(ts: Training[]): Training[] {
  return [...ts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
