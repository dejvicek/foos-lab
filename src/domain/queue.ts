import { resolveRange, type LadderRange, type LadderView } from './ladder';
import type { Match, PlayerId, PlayTimes, Schedule, Training } from './types';

/**
 * Aktivní utkání a Zdržovači (PRD 4.8). Fronta = pořadí z rozpisu; utkání je aktivní, když jsou
 * všichni jeho hráči volní a je volný stůl. Plánované časy rozpisu se nepoužívají; začátek tréninku
 * je první zahájení. Čas v ms (epoch); „teď“ dodává volající, doména nečte hodiny.
 */
export type QueueEntry =
  | { kind: 'item'; id: string; players: PlayerId[]; table: number; label: string; group: boolean; match?: Match }
  | { kind: 'pause'; min: number; label: string };

export type ItemStateKind = 'queued' | 'ready' | 'playing' | 'done';

export interface ItemState {
  id: string;
  /** Stůl, na kterém se utkání hraje / je vypsané (může se lišit od rozpisu). */
  table: number | null;
  /** Kdy se utkání stalo aktivním (null = zatím nelze určit). */
  activeAt: number | null;
  startedAt?: number;
  endedAt?: number;
  state: ItemStateKind;
  /** U neaktivního utkání: hráči, kteří ještě hrají / čekají na dřívější utkání. */
  blockedBy?: PlayerId[];
}

/** ID utkání ve cvičení: kolo, stůl a hráči skupiny (hráči v ID kvůli právům zápisu jako u zápasů). */
export const drillItemId = (label: string, table: number, players: PlayerId[]) => `drill|${label}|${table}|${players.join('+')}`;

/** Fronta utkání z rozpisu: kolo po kole, stůl po stole; pauzy jako přehrady; závěrečný zápis se nepočítá. */
export function queueOf(s: Schedule): QueueEntry[] {
  const rows = s.sections.flatMap((sec) => sec.rows);
  const out: QueueEntry[] = [];
  rows.forEach((row, i) => {
    if (row.kind === 'break') {
      if (row.label === 'Pauza') out.push({ kind: 'pause', min: Math.max(0, (rows[i + 1]?.time ?? row.time) - row.time), label: row.label });
      return;
    }
    row.cells.forEach((c, j) => {
      if (!c) return;
      if (c.type === 'match')
        out.push({ kind: 'item', id: c.match.id, players: [...c.match.sideA, ...c.match.sideB], table: j + 1, label: row.label, group: false, match: c.match });
      else if (c.players.length)
        out.push({ kind: 'item', id: drillItemId(row.label, j + 1, c.players), players: c.players, table: j + 1, label: row.label, group: true });
    });
  });
  return out;
}

/**
 * Projde frontu v pořadí a určí, kdy se které utkání stalo aktivním a na kterém stole.
 * Stůl z rozpisu má přednost, jiný volný stůl jen když utkání pustí na hru dřív.
 */
export function runQueue(queue: QueueEntry[], times: PlayTimes, tables: number[], nowMs: number): Map<string, ItemState> {
  const out = new Map<string, ItemState>();
  // Plánované časy jsou jen orientační: trénink začíná prvním zahájeným utkáním (do té doby „teď“).
  const firstStart = Math.min(...Object.values(times).flatMap((t) => (t.startedAt !== undefined ? [t.startedAt] : [])));
  const startMs = Number.isFinite(firstStart) ? firstStart : nowMs;
  // null = obsazený / zaneprázdněný na neurčito
  const tableFree = new Map<number, number | null>(tables.map((t) => [t, startMs]));
  const playerFree = new Map<PlayerId, number | null>();
  let barrier: number | null = startMs;
  let maxEnd = startMs;
  let unended = false;

  for (const e of queue) {
    if (e.kind === 'pause') {
      barrier = unended || barrier === null ? null : Math.max(barrier, maxEnd) + e.min * 60_000;
      continue;
    }
    const tm = times[e.id] ?? {};
    const busy = e.players.filter((p) => playerFree.get(p) === null);
    const pf = busy.length ? null : Math.max(startMs, ...e.players.map((p) => playerFree.get(p) ?? startMs));

    // Kdy a kde by utkání mohlo začít.
    let table: number | null = null;
    let activeAt: number | null = null;
    if (barrier !== null && pf !== null) {
      const base = Math.max(barrier, pf);
      const when = (t: number) => {
        const f = tableFree.get(t);
        return f === null || f === undefined ? null : Math.max(base, f);
      };
      const planned = tableFree.has(e.table) ? when(e.table) : null;
      let best: { t: number; at: number } | null = planned !== null ? { t: e.table, at: planned } : null;
      for (const t of tables) {
        const w = when(t);
        if (w !== null && (best === null || w < best.at)) best = { t, at: w };
      }
      if (best) ({ t: table, at: activeAt } = best);
    }

    let state: ItemStateKind;
    if (tm.startedAt !== undefined) {
      // Zahájené: čekání nejvýš do zahájení (kdo začal dřív, nečekal).
      activeAt = activeAt === null ? tm.startedAt : Math.min(activeAt, tm.startedAt);
      table = table ?? e.table;
      state = tm.endedAt !== undefined ? 'done' : 'playing';
    } else if (activeAt !== null) state = activeAt <= nowMs ? 'ready' : 'queued';
    else state = 'queued';

    const end = tm.startedAt !== undefined && tm.endedAt !== undefined ? tm.endedAt : null;
    if (end === null) unended = true;
    else maxEnd = Math.max(maxEnd, end);
    // Vypsané / hrané utkání drží stůl i hráče do konce; neaktivní drží hráče (pořadí se nepřeskakuje).
    if (table !== null && (activeAt !== null || tm.startedAt !== undefined)) tableFree.set(table, end);
    for (const p of e.players) playerFree.set(p, end);

    out.set(e.id, {
      id: e.id,
      table: activeAt !== null || tm.startedAt !== undefined ? table : null,
      activeAt,
      ...(tm.startedAt !== undefined ? { startedAt: tm.startedAt } : {}),
      ...(tm.endedAt !== undefined ? { endedAt: tm.endedAt } : {}),
      state,
      ...(state === 'queued' && activeAt === null && busy.length ? { blockedBy: busy } : {}),
    });
  }
  return out;
}

export interface DelayRow {
  playerId: PlayerId;
  /** Utkání se změřeným čekáním (zahájená). */
  items: number;
  waitSum: number;
  waitAvg: number;
  /** Utkání se změřenou hrou (zahájená i ukončená). */
  playN: number;
  playSum: number;
  playAvg: number | null;
}

interface Acc {
  items: number;
  waitSum: number;
  playN: number;
  playSum: number;
  trainings: number;
}

function accumulate(acc: Map<PlayerId, Acc>, queue: QueueEntry[], states: Map<string, ItemState>) {
  const seen = new Set<PlayerId>();
  for (const e of queue) {
    if (e.kind !== 'item') continue;
    const s = states.get(e.id);
    if (!s || s.startedAt === undefined || s.activeAt === null) continue;
    const wait = Math.max(0, s.startedAt - s.activeAt);
    const play = s.endedAt !== undefined ? Math.max(0, s.endedAt - s.startedAt) : null;
    for (const p of e.players) {
      const a = acc.get(p) ?? { items: 0, waitSum: 0, playN: 0, playSum: 0, trainings: 0 };
      a.items++;
      a.waitSum += wait;
      if (play !== null) {
        a.playN++;
        a.playSum += play;
      }
      if (!seen.has(p)) {
        a.trainings++;
        seen.add(p);
      }
      acc.set(p, a);
    }
  }
}

const toRow = (playerId: PlayerId, a: Acc): DelayRow & { trainings: number } => ({
  playerId,
  trainings: a.trainings,
  items: a.items,
  waitSum: a.waitSum,
  waitAvg: a.waitSum / a.items,
  playN: a.playN,
  playSum: a.playSum,
  playAvg: a.playN ? a.playSum / a.playN : null,
});

const byWait = (key: 'waitAvg' | 'waitSum') => (x: DelayRow, y: DelayRow) =>
  y[key] - x[key] || (x.playerId < y.playerId ? -1 : x.playerId > y.playerId ? 1 : 0);

/** Zdržovači jednoho tréninku: kdo čekal nejdéle, než zahájil (průměr na utkání). */
export function delayStats(queue: QueueEntry[], states: Map<string, ItemState>): DelayRow[] {
  const acc = new Map<PlayerId, Acc>();
  accumulate(acc, queue, states);
  return [...acc].map(([p, a]) => toRow(p, a)).sort(byWait('waitAvg'));
}

export interface DelayLadderRow extends DelayRow {
  trainings: number;
}

/** Zdržovači v žebříčku: tréninky v období; Průměr řadí podle čekání na utkání, Celkem podle součtu. */
export function computeDelayLadder(
  trainings: Training[],
  range: LadderRange,
  view: LadderView,
  today: string,
  ctx: (t: Training) => { queue: QueueEntry[]; states: Map<string, ItemState> } | null,
): DelayLadderRow[] {
  const r = resolveRange(range, today);
  const acc = new Map<PlayerId, Acc>();
  for (const t of trainings) {
    if ((r.from && t.date < r.from) || (r.to && t.date > r.to)) continue;
    const c = ctx(t);
    if (c) accumulate(acc, c.queue, c.states);
  }
  return [...acc].map(([p, a]) => toRow(p, a)).sort(byWait(view === 'avg' ? 'waitAvg' : 'waitSum'));
}
