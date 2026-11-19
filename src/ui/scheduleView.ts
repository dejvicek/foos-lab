/**
 * Rozpis na stránce Trénink očima hráče (18. 11. 2026, *rozhodnutí uživatele*): číslo kola je jen v uzlu
 * časové osy, řádek nese název disciplíny a délku, kola s mou účastí mají zlatý pruh, moje jméno je
 * tučně zlatě, odehraná kola se během běžícího tréninku sbalí. Volno místo „Mimo stůl“.
 */
import { matchState } from '../domain/matchFormat';
import { drillItemId } from '../domain/queue';
import type { Cell, Match, PlayerId, Schedule, ScheduleRow, Score, SoloKey, Training } from '../domain/types';
import { flatRows, rowKey } from './now';
import type { RoundStatus } from './roundState';

/** Pořadí hracích kol (1, 2, …) podle klíče řádku; pauzy číslo nemají. */
export function roundNumbers(s: Schedule): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const ref of flatRows(s)) if (s.sections[ref.section].rows[ref.row].kind !== 'break') out.set(rowKey(ref), ++n);
  return out;
}

/** Délka řádku v minutách: z pravidla kola, jinak do začátku dalšího řádku, poslední do konce tréninku. */
export function rowMinutes(s: Schedule, durationMin?: number): Map<string, number> {
  const refs = flatRows(s);
  const out = new Map<string, number>();
  refs.forEach((ref, i) => {
    const row = s.sections[ref.section].rows[ref.row];
    const next = refs[i + 1] ? s.sections[refs[i + 1].section].rows[refs[i + 1].row] : null;
    // Délka kola z pravidla („…, 24 min“), jinak do dalšího řádku, poslední do konce tréninku.
    const fromRule = row.rule?.match(/(\d+) min\b/);
    const min = fromRule ? Number(fromRule[1]) : next ? next.time - row.time : durationMin && durationMin > row.time ? durationMin - row.time : 0;
    if (min > 0) out.set(rowKey(ref), min);
  });
  return out;
}

/** Název disciplíny řádku: pravidlo bez délky („Normální leg“, „Zeď“); simulace „Simulace · 1. vlna“. */
/** Krátké poslední slovo („varianta 1“, „Start 0:3“) nezůstane samo na řádku – pevná mezera před ním (19. 11. 2026). */
export const keepLast = (s: string): string => s.replace(/ (\S{1,3})$/, '\u00a0$1');

export function rowName(row: ScheduleRow, sectionId?: string): string {
  if (row.discipline === 'sim' || sectionId === 'sim') return `Simulace · ${row.label}`;
  // Formát zápasu (BO3 do 5) je vedle délky kola, ne v názvu (19. 11. 2026).
  const rule = row.rule?.split(',')[0].replace(BO_RE, '').trim();
  return rule && !/^\d+ min$/.test(rule) ? rule : row.label;
}

const BO_RE = /\s*\bBO\d[^,]*/;

/**
 * Formát zápasu z pravidla řádku („BO3 do 5“), nebo null – v rozpisu vedle délky kola (19. 11. 2026).
 * Krátce jen „BO3 do 6“ bez rozhodujícího legu (hlavička dlaždice na telefonu).
 */
export function rowFormat(row: ScheduleRow, short = false): string | null {
  const f = row.rule?.match(BO_RE)?.[0].trim() ?? null;
  return f && short ? (f.match(/^BO\d+(?: do \d+)?/)?.[0] ?? f) : f;
}

/** Podřádek kola: „24 min · BO3 do 5“ (a u organizátora průběh zápisu); bez formátu, když je jinde. */
export const rowSub = (min: number | undefined, row: ScheduleRow, extra?: string | null, withFormat = true): string =>
  [min ? `${min} min` : null, withFormat ? rowFormat(row) : null, extra].filter(Boolean).join(' · ');

export type Place = { kind: 'play' | 'ref'; table: number } | { kind: 'free' } | { kind: 'none' };

/** Kde v kole jsem: hraju u stolu, rozhoduju, mám volno, nebo v tréninku nejsem. */
export function placeOf(row: ScheduleRow, me: PlayerId | null): Place {
  if (!me) return { kind: 'none' };
  for (let j = 0; j < row.cells.length; j++) {
    const c = row.cells[j];
    if (!c) continue;
    if (c.type === 'group' ? c.players.includes(me) : [...c.match.sideA, ...c.match.sideB].includes(me)) return { kind: 'play', table: j + 1 };
  }
  const j = row.cells.findIndex((c) => c?.type === 'match' && c.match.referee === me);
  if (j >= 0) return { kind: 'ref', table: j + 1 };
  return row.waiting.includes(me) ? { kind: 'free' } : { kind: 'none' };
}

/** Účastním se kola (hraju nebo rozhoduju) – zlatý pruh u řádku. */
export const takesPart = (p: Place) => p.kind === 'play' || p.kind === 'ref';

/**
 * Klíče odehraných řádků, které se mají sbalit: během běžícího tréninku souvislý začátek rozpisu,
 * kde je všechno odehrané (i pauzy). Po konci tréninku nic.
 */
export function collapsedDone(s: Schedule, rounds: Map<string, RoundStatus> | null, running: boolean): Set<string> {
  const out = new Set<string>();
  if (!rounds || !running) return out;
  // Do prvního neodehraného kola; pauzy mezi odehranými koly se sbalí s nimi (i nezahájené).
  const refs = flatRows(s);
  const firstOpen = refs.findIndex((ref) => s.sections[ref.section].rows[ref.row].kind !== 'break' && rounds.get(rowKey(ref))?.state !== 'done');
  // …ale pauza těsně před dalším kolem zůstává vidět (organizátor ji zahajuje).
  let upTo = firstOpen < 0 ? refs.length : firstOpen;
  while (upTo > 0 && s.sections[refs[upTo - 1].section].rows[refs[upTo - 1].row].kind === 'break') upTo--;
  for (const ref of refs.slice(0, upTo)) out.add(rowKey(ref));
  return refs.slice(0, upTo).some((ref) => s.sections[ref.section].rows[ref.row].kind !== 'break') ? out : new Set();
}

/** Všechny řádky „bude se hrát“ – osa s čísly kol i před začátkem tréninku. */
export function upcomingRounds(s: Schedule): Map<string, RoundStatus> {
  return new Map(flatRows(s).map((ref) => [rowKey(ref), { state: 'upcoming' as const, done: 0, total: 0, cells: [] }]));
}

/**
 * Admin / organizátor v Tréninku zapisuje jen celkový výsledek; zapsaný dohraný výsledek utkání ukončí
 * (nezahajuje ani nepotvrzuje konec, 18. 11. 2026). Vrací ID utkání, které se tím dohrálo, nebo null.
 */
export function finishedByScore(row: ScheduleRow, scores: Training['scores'], id: string, sc: Score): string | null {
  const base = id.split('#')[0];
  const m = row.cells.flatMap((c) => (c?.type === 'match' && c.match.id === base ? [c.match] : []))[0] as Match | undefined;
  if (!m) return null;
  return matchState(m, { ...scores, [id]: sc }).over ? base : null;
}

/** Cvičení: po zapsání výsledku posledního hráče skupiny je stůl hotový (ID utkání skupiny), jinak null. */
export function finishedBySolo(row: ScheduleRow, t: Training, player: PlayerId, key: SoloKey, value: number | null): string | null {
  if (value === null) return null;
  const j = row.cells.findIndex((c: Cell | null) => c?.type === 'group' && c.players.includes(player));
  const c = row.cells[j];
  if (!c || c.type !== 'group') return null;
  const all = c.players.every((p) => (p === player ? true : t.soloResults[p]?.[key] !== undefined));
  return all ? drillItemId(row, j + 1, c.players) : null;
}
