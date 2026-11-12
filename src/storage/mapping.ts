import { DEFAULT_START, parseSoloKey, soloKey, soloMetric } from '../domain/solo';
import { isEmptyScore } from '../domain/training';
import { DISCIPLINES } from '../domain/disciplines';
import type { MatchId, Mode, Player, PlayerId, Score, LockedRound, SimSplit, SimTeams, SoloKey, SoloMetric, SoloResults, TrainingFormat, TableCount, Training, Breaks, PlayTime, PlayTimes, GameEvent } from '../domain/types';

import type { CatalogData } from '../domain/catalog';
import type { AppData, DrillTap, Loaded, ScoreTap } from './repository';

export { isEmptyScore };

export interface PlayerRow {
  id: string;
  name: string;
  archived: boolean;
  sort_order: number;
  /** Migrace 20 (10. 11. 2026). */
  is_organizer?: boolean;
}

export interface TrainingRow {
  id: string;
  date: string;
  start_time: string | null;
  sim_split: SimSplit | null;
  sim_teams: SimTeams | null;
  format: TrainingFormat | null;
  duration_min: number | null;
  plan: Training['plan'] | null;
  locked_rounds: LockedRound[] | null;
  /** Vlastní pauzy (migrace 11); null = automatické. */
  breaks: Breaks;
  /** Délky kol (snímek katalogu, migrace 18); null = výchozí z kódu. */
  discipline_min?: Training['disciplineMin'];
  match_formats?: Training['matchFormats'];
  /** Pořadí disciplín ze šablony (migrace 19); null = pořadí katalogu. */
  discipline_order?: Training['disciplineOrder'];
  created_by: string | null;
  /** Verze nastavení (migrace 25); k uložení se neposílá – očekávaná verze jde zvlášť. */
  version?: number;
  mode: Mode;
  tables: number;
  attendees: string[];
  notes: string | null;
}

export interface SoloRow {
  training_id: string;
  player_id: string;
  metric: SoloMetric;
  /** 0 = klasický trénink, jinak číslo kola (PRD 6, migrace 5). */
  round: number;
  value: number;
  /** Odehrané pokusy (migrace 13); null = zapsáno číslem = plný počet. */
  attempts?: number | null;
}

export interface ScoreRow {
  training_id: string;
  match_id: string;
  ga: number | null;
  gb: number | null;
  la: number | null;
  lb: number | null;
}

export const playerToRow = (p: Player): PlayerRow => ({
  id: p.id,
  name: p.name,
  archived: p.archived,
  sort_order: p.order,
  is_organizer: !!p.organizer,
});

export const playerFromRow = (r: PlayerRow): Player => ({
  id: r.id,
  name: r.name,
  archived: r.archived,
  order: r.sort_order,
  ...(r.is_organizer ? { organizer: true } : {}),
});

export const trainingToRow = (t: Training): TrainingRow => ({
  id: t.id,
  date: t.date,
  start_time: t.startTime,
  sim_split: t.simSplit,
  sim_teams: t.simTeams,
  format: t.format,
  duration_min: t.durationMin,
  plan: t.plan,
  locked_rounds: t.lockedRounds,
  breaks: t.breaks ?? null,
  discipline_min: t.disciplineMin ?? null,
  discipline_order: t.disciplineOrder ?? null,
  match_formats: t.matchFormats ?? null,
  created_by: t.createdBy ?? null,
  mode: t.mode,
  tables: t.tables,
  attendees: t.attendees,
  notes: t.notes ?? null,
});

const SCORE_FIELDS = ['ga', 'gb', 'la', 'lb'] as const;

export const scoreFromRowPublic = (r: ScoreRow): Score => scoreFromRow(r);

function scoreFromRow(r: ScoreRow): Score {
  const s: Score = {};
  for (const f of SCORE_FIELDS) if (r[f] !== null && r[f] !== undefined) s[f] = r[f];
  return s;
}

const KNOWN = new Set<string>(DISCIPLINES.map((d) => d.id));

export function trainingFromRow(r: TrainingRow, scores: ScoreRow[], solo: SoloRow[], times: PlayTimeRow[] = [], events: EventRow[] = []): Training {
  const soloResults: SoloResults = {};
  const soloAttempts: SoloResults = {};
  for (const x of solo) {
    if (x.training_id !== r.id) continue;
    (soloResults[x.player_id] ??= {})[soloKey(x.metric, x.round ?? 0)] = x.value;
    if (x.attempts !== null && x.attempts !== undefined) (soloAttempts[x.player_id] ??= {})[soloKey(x.metric, x.round ?? 0)] = x.attempts;
  }
  const t: Training = {
    id: r.id,
    date: r.date,
    startTime: r.start_time || DEFAULT_START,
    mode: r.mode,
    tables: r.tables as TableCount,
    attendees: r.attendees ?? [],
    scores: Object.fromEntries(scores.filter((s) => s.training_id === r.id).map((s) => [s.match_id, scoreFromRow(s)])),
    soloResults,
    simSplit: r.sim_split === 'order' || r.sim_split === 'manual' ? r.sim_split : 'performance',
    simTeams: r.sim_teams ?? null,
    format: r.format === 'custom' || r.format === 'practice' ? r.format : 'classic',
    durationMin: r.duration_min ?? 180,
    // Odstraněné disciplíny (např. Obrana do držení, 3. 11. 2026) se z uloženého plánu vynechají.
    plan: Object.fromEntries(Object.entries(r.plan ?? {}).filter(([id]) => KNOWN.has(id))) as Training['plan'],
    lockedRounds: r.locked_rounds ?? [],
    ...(r.created_by ? { createdBy: r.created_by } : {}),
    ...(r.version ? { version: r.version } : {}),
    ...(r.breaks ? { breaks: r.breaks } : {}),
    ...(r.discipline_min ? { disciplineMin: r.discipline_min } : {}),
    ...(r.match_formats ? { matchFormats: r.match_formats } : {}),
    ...(r.discipline_order ? { disciplineOrder: r.discipline_order.filter((id) => KNOWN.has(id)) } : {}),
    ...(Object.keys(soloAttempts).length ? { soloAttempts } : {}),
    ...(() => {
      const mine = events.filter((x) => x.training_id === r.id).map(eventFromRow);
      return mine.length ? { events: mine } : {};
    })(),
    ...(() => {
      const mine = times.filter((x) => x.training_id === r.id);
      if (!mine.length) return {};
      const playTimes: PlayTimes = {};
      for (const x of mine) playTimes[x.item_id] = playTimeFromRow(x);
      return { playTimes };
    })(),
  };
  if (r.notes !== null && r.notes !== undefined) t.notes = r.notes;
  return t;
}

export interface PlayTimeRow {
  training_id: string;
  item_id: string;
  started_at: string | null;
  ended_at: string | null;
}

const iso = (ms: number | undefined) => (ms === undefined ? null : new Date(ms).toISOString());

export const playTimeToRow = (trainingId: string, itemId: string, p: PlayTime): PlayTimeRow => ({
  training_id: trainingId,
  item_id: itemId,
  started_at: iso(p.startedAt),
  ended_at: iso(p.endedAt),
});

export function playTimeFromRow(r: PlayTimeRow): PlayTime {
  const p: PlayTime = {};
  if (r.started_at) p.startedAt = Date.parse(r.started_at);
  if (r.ended_at) p.endedAt = Date.parse(r.ended_at);
  return p;
}

export interface EventRow {
  id: string;
  training_id: string;
  item_id: string;
  at: string;
  kind: GameEvent['kind'];
  side: 'A' | 'B' | null;
  player_id: string | null;
  delta: number;
}

/** Ťuknutí do skóre, jak ho čeká funkce tap_score (migrace 21). */
export const scoreTapToJson = (t: ScoreTap) => ({ id: t.id, at: new Date(t.at).toISOString(), field: t.field, delta: t.delta, max: t.max });

/** Pokus cvičení, jak ho čeká funkce tap_drill (migrace 21). */
export const drillTapToJson = (t: DrillTap) => ({
  id: t.id,
  at: new Date(t.at).toISOString(),
  item: t.itemId,
  kind: t.ok ? 'hit' : 'miss',
  delta: t.delta,
  dvalue: t.dValue,
  dattempts: t.dAttempts,
});

export function eventFromRow(r: EventRow): GameEvent {
  const e: GameEvent = { id: r.id, itemId: r.item_id, at: Date.parse(r.at), kind: r.kind, delta: r.delta < 0 ? -1 : 1 };
  if (r.side) e.side = r.side;
  if (r.player_id) e.playerId = r.player_id;
  return e;
}

export const scoreToRow = (trainingId: string, matchId: MatchId, s: Score): ScoreRow => ({
  training_id: trainingId,
  match_id: matchId,
  ga: s.ga ?? null,
  gb: s.gb ?? null,
  la: s.la ?? null,
  lb: s.lb ?? null,
});

export function soloToRows(t: Training): SoloRow[] {
  const out: SoloRow[] = [];
  for (const [player_id, metrics] of Object.entries(t.soloResults))
    for (const [metric, value] of Object.entries(metrics))
      if (value !== undefined && value !== null) {
        const k = parseSoloKey(metric);
        out.push({ training_id: t.id, player_id, metric: k.metric, round: k.round, value, attempts: t.soloAttempts?.[player_id]?.[metric] ?? null });
      }
  return out;
}

export function soloRow(trainingId: string, playerId: PlayerId, key: SoloKey, value: number): SoloRow {
  const k = parseSoloKey(key);
  // Zapsáno číslem = dokončené cvičení: plný počet pokusů se zapíše výslovně (od 11. 11. 2026, kdy se
  // změnil z 10 na 20 – prázdné pokusy v databázi pak znamenají jen starší výsledky z 10, migrace 27).
  return { training_id: trainingId, player_id: playerId, metric: k.metric, round: k.round, value, attempts: soloMetric(k.metric)?.max ?? null };
}

/** Odpověď funkce changes_since (migrace 23): řádky tabulek tak, jak jsou v databázi. */
export interface ChangesJson {
  full: boolean;
  cursor: string;
  players: PlayerRow[];
  trainings: TrainingRow[];
  scores: ScoreRow[];
  solo_results: SoloRow[];
  play_times: PlayTimeRow[];
  catalog: CatalogData | null;
  deleted: { tbl: string; key: Record<string, string | number> }[];
}

/** Kompletní data, nebo změny od kurzoru – podle toho, co server poslal. */
export function loadedFromJson(j: ChangesJson): Loaded {
  if (j.full) {
    const full: AppData = {
      players: j.players.map(playerFromRow),
      trainings: j.trainings.map((t) => trainingFromRow(t, j.scores, j.solo_results, j.play_times)),
      catalog: j.catalog ?? {},
      cursor: j.cursor,
    };
    return { full };
  }
  const del = (tbl: string) => j.deleted.filter((d) => d.tbl === tbl).map((d) => d.key);
  return {
    changes: {
      cursor: j.cursor,
      players: j.players.map(playerFromRow),
      trainings: j.trainings.map((t) => trainingFromRow(t, [], [])),
      scores: j.scores.map((r) => ({ trainingId: r.training_id, matchId: r.match_id, score: scoreFromRow(r) })),
      solo: j.solo_results.map((r) => ({ trainingId: r.training_id, playerId: r.player_id, key: soloKey(r.metric, r.round ?? 0), value: r.value, attempts: r.attempts ?? null })),
      playTimes: j.play_times.map((r) => ({ trainingId: r.training_id, itemId: r.item_id, time: playTimeFromRow(r) })),
      ...(j.catalog ? { catalog: j.catalog } : {}),
      deleted: {
        players: del('players').map((k) => String(k.id)),
        trainings: del('trainings').map((k) => String(k.id)),
        scores: del('scores').map((k) => ({ trainingId: String(k.training_id), matchId: String(k.match_id) })),
        solo: del('solo_results').map((k) => ({ trainingId: String(k.training_id), playerId: String(k.player_id), key: soloKey(k.metric as SoloMetric, Number(k.round ?? 0)) })),
        playTimes: del('play_times').map((k) => ({ trainingId: String(k.training_id), itemId: String(k.item_id) })),
      },
    },
  };
}
