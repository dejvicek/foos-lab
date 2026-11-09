import { DEFAULT_START, parseSoloKey, soloKey } from '../domain/solo';
import { isEmptyScore } from '../domain/training';
import { DISCIPLINES } from '../domain/disciplines';
import type { MatchId, Mode, Player, PlayerId, Score, LockedRound, SimSplit, SimTeams, SoloKey, SoloMetric, SoloResults, TrainingFormat, TableCount, Training, Breaks, PlayTime, PlayTimes, GameEvent } from '../domain/types';

export { isEmptyScore };

export interface PlayerRow {
  id: string;
  name: string;
  archived: boolean;
  sort_order: number;
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
  /** Pořadí disciplín ze šablony (migrace 19); null = pořadí katalogu. */
  discipline_order?: Training['disciplineOrder'];
  created_by: string | null;
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
});

export const playerFromRow = (r: PlayerRow): Player => ({
  id: r.id,
  name: r.name,
  archived: r.archived,
  order: r.sort_order,
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
    format: r.format === 'custom' ? 'custom' : 'classic',
    durationMin: r.duration_min ?? 180,
    // Odstraněné disciplíny (např. Obrana do držení, 3. 11. 2026) se z uloženého plánu vynechají.
    plan: Object.fromEntries(Object.entries(r.plan ?? {}).filter(([id]) => KNOWN.has(id))) as Training['plan'],
    lockedRounds: r.locked_rounds ?? [],
    ...(r.created_by ? { createdBy: r.created_by } : {}),
    ...(r.breaks ? { breaks: r.breaks } : {}),
    ...(r.discipline_min ? { disciplineMin: r.discipline_min } : {}),
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

export const eventToRow = (trainingId: string, e: GameEvent): EventRow => ({
  id: e.id,
  training_id: trainingId,
  item_id: e.itemId,
  at: new Date(e.at).toISOString(),
  kind: e.kind,
  side: e.side ?? null,
  player_id: e.playerId ?? null,
  delta: e.delta,
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
  // Zapsáno číslem: pokusy se mažou (= dokončené cvičení).
  return { training_id: trainingId, player_id: playerId, metric: k.metric, round: k.round, value, attempts: null };
}
