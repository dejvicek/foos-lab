import { drillItemId, type ItemState, type ItemStateKind, type PauseState } from '../domain/queue';
import type { Schedule, ScheduleRow } from '../domain/types';
import { flatRows, rowKey, type RowRef } from './now';

export type RoundStateKind = 'done' | 'playing' | 'upcoming';

/** Stav řádku rozpisu podle skutečně zahájených / potvrzených utkání (ne podle hodin). */
export interface RoundStatus {
  state: RoundStateKind;
  /** Od kdy se kolo hraje (první zahájení) / pauza běží (ms). */
  since?: number;
  /** Potvrzená utkání kola z celkového počtu. */
  done: number;
  total: number;
  /** Stav utkání po stolech (zarovnané s row.cells; null = volný stůl). */
  cells: (ItemStateKind | null)[];
}

/** ID utkání v buňkách řádku – stejně jako fronta (queueOf). */
function cellIds(row: ScheduleRow): (string | null)[] {
  return row.cells.map((c, j) => (!c ? null : c.type === 'match' ? c.match.id : c.players.length ? drillItemId(row, j + 1, c.players) : null));
}

/**
 * Stav všech řádků rozpisu: odehrané (všechna utkání potvrzená), hraje se (něco běží / je na řadě
 * nebo už je část hotová), bude se hrát. Pauzy podle zahájení organizátorem. Null = trénink nezačal.
 */
export function roundStates(s: Schedule, states: Map<string, ItemState>, pauses: PauseState[]): Map<string, RoundStatus> | null {
  const started = [...states.values()].some((x) => x.activeAt !== null || x.startedAt !== undefined);
  if (!started) return null;
  const refs = flatRows(s);
  const out = new Map<string, RoundStatus>();
  let k = 0;
  // 1. průchod: kola a pauzy
  refs.forEach((ref) => {
    const row = s.sections[ref.section].rows[ref.row];
    const key = rowKey(ref);
    if (row.kind === 'break') {
      if (row.label !== 'Pauza') return;
      const p = pauses[k++];
      const state: RoundStateKind = p?.state === 'over' ? 'done' : p?.state === 'running' ? 'playing' : 'upcoming';
      out.set(key, { state, ...(p?.endsAt !== undefined ? { since: p.endsAt - p.min * 60_000 } : {}), done: 0, total: 0, cells: [] });
      return;
    }
    const cells = cellIds(row).map((id) => (id ? (states.get(id)?.state ?? 'queued') : null));
    const items = cellIds(row).flatMap((id) => (id && states.get(id) ? [states.get(id)!] : []));
    const done = items.filter((x) => x.state === 'done').length;
    const active = items.some((x) => x.state === 'playing' || x.state === 'ready');
    const state: RoundStateKind = items.length && done === items.length ? 'done' : active || done ? 'playing' : 'upcoming';
    // „hraje se X min“ od prvního zahájení; jen na řadě (nikdo nezačal) → bez času
    const starts = items.flatMap((x) => (x.startedAt !== undefined ? [x.startedAt] : []));
    out.set(key, { state, ...(state === 'playing' && starts.length ? { since: Math.min(...starts) } : {}), done, total: items.length, cells });
  });
  // 2. průchod: ostatní přestávky (závěrečný zápis …) – odehrané, když je odehrané vše za nimi i před nimi
  refs.forEach((ref, i) => {
    const key = rowKey(ref);
    if (out.has(key)) return;
    const next = refs.slice(i + 1).map((r) => out.get(rowKey(r))).find((x) => x && x.total > 0);
    const allDone = [...out.values()].every((x) => x.total === 0 || x.state === 'done');
    const state: RoundStateKind = next ? (next.state === 'upcoming' ? 'upcoming' : 'done') : allDone ? 'done' : 'upcoming';
    out.set(key, { state, done: 0, total: 0, cells: [] });
  });
  return out;
}

/** První hrané kolo (ne pauza) – výchozí rozbalený blok během tréninku. */
export function playingRow(s: Schedule, rounds: Map<string, RoundStatus> | null): RowRef | null {
  if (!rounds) return null;
  return flatRows(s).find((r) => s.sections[r.section].rows[r.row].kind !== 'break' && rounds.get(rowKey(r))?.state === 'playing') ?? null;
}

export const STATE_LABEL: Record<RoundStateKind, string> = { done: 'Odehráno', playing: 'Hraje se', upcoming: 'Bude se hrát' };

/**
 * Třídy řádku s uzlem časové osy: st-<stav>; rt = linka shora zelená (předchozí odehraný),
 * rb = linka dolů zelená (tento odehraný). Bez stavu (trénink nezačal) prázdné.
 */
export function railClass(rounds: Map<string, RoundStatus> | null, keys: string[], i: number): string {
  if (!rounds) return '';
  const st = rounds.get(keys[i])?.state ?? 'upcoming';
  const prev = i > 0 && rounds.get(keys[i - 1])?.state === 'done';
  return ['rail', `st-${st}`, prev ? 'rt' : '', st === 'done' ? 'rb' : '', i === 0 ? 'rail-first' : '', i === keys.length - 1 ? 'rail-last' : '']
    .filter(Boolean)
    .join(' ');
}

/** Třídy prvku bez uzlu (nadpis sekce, rozbalený blok): linka zelená, když je řádek nad ním odehraný. */
export function railLine(rounds: Map<string, RoundStatus> | null, keys: string[], above: number): string {
  if (!rounds) return '';
  if (above < 0) return '';
  return rounds.get(keys[above])?.state === 'done' ? 'rail-line on' : 'rail-line';
}

/** „hraje se 4 min · 1 z 2 stolů hotovo“ / „pauza běží“. */
export function liveText(st: RoundStatus | undefined, now: number, pause: boolean): string | null {
  if (!st || st.state !== 'playing') return null;
  if (pause) return 'pauza běží';
  const min = st.since !== undefined ? Math.max(0, Math.floor((now - st.since) / 60_000)) : null;
  const parts = [min === null ? 'na řadě' : `hraje se ${min} min`];
  if (st.total > 1 && st.done > 0) parts.push(`${st.done} z ${st.total} stolů hotovo`);
  return parts.join(' · ');
}
