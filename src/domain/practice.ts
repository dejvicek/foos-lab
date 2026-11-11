/**
 * Vlastní trénink (PRD 5.11, 11. 11. 2026): hráč cvičí mimo klubový trénink sám nebo ve dvou.
 * Ukládá se jako Training s formátem 'practice'; výsledky jsou výsledky sólové části s klíčem
 * `metrika@n` (n = pořadí série), zahájení a konec jsou časy utkání `training`.
 */
import { DISCIPLINES, type DisciplineDef } from './disciplines';
import { TRAINING_ITEM } from './queue';
import { parseSoloKey, soloMetric } from './solo';
import type { PlayerId, SoloKey, SoloMetric, Training } from './types';

export const PRACTICE_MAX_PLAYERS = 2;
/** Neukončený vlastní trénink zahájený před víc než 12 h se bere jako skončený (zapomenuté „Ukončit“). */
export const PRACTICE_MAX_AGE_MS = 12 * 3_600_000;

export const isPractice = (t: Pick<Training, 'format'>): boolean => t.format === 'practice';
/** Klubový trénink (klasický nebo konfigurovatelný) – jen ty se počítají do klubových žebříčků a docházky. */
export const isClub = (t: Pick<Training, 'format'>): boolean => !isPractice(t);

export function newPractice(id: string, date: string, startTime: string, me: PlayerId, partner: PlayerId | null = null): Training {
  return {
    id,
    date,
    startTime,
    mode: 'single',
    tables: 1,
    attendees: partner && partner !== me ? [me, partner] : [me],
    scores: {},
    soloResults: {},
    simSplit: 'performance',
    simTeams: null,
    format: 'practice',
    durationMin: 0,
    plan: {},
    lockedRounds: [],
    createdBy: me,
  };
}

/** Nabídka cvičení: nevyřazená cvičení s metrikou a Rozcvička; sám jen ta bez bránícího soupeře. */
export function practiceDrills(players: number): DisciplineDef[] {
  return DISCIPLINES.filter((d) => d.kind === 'drill' && !d.retired && (d.metric || d.individual) && (players >= 2 || !d.needsPartner));
}

/** Metrika cvičení ve vlastním tréninku (Udržení míče na pětce sám → fiveBarSolo); Rozcvička žádnou nemá. */
export function practiceMetric(d: DisciplineDef, players: number): SoloMetric | undefined {
  if (!d.metric) return undefined;
  return players < 2 && d.soloMetric ? d.soloMetric : d.metric;
}

/** Disciplína, do které metrika patří (název a popisky v UI). */
export function seriesDrill(metric: SoloMetric): DisciplineDef {
  return DISCIPLINES.find((d) => d.metric === metric) ?? DISCIPLINES.find((d) => d.soloMetric === metric)!;
}

export interface SeriesResult {
  playerId: PlayerId;
  value: number;
  /** Odehrané pokusy (zapsáno číslem = plný počet). */
  attempts: number;
  max: number;
}

export interface PracticeSeries {
  n: number;
  metric: SoloMetric;
  key: SoloKey;
  /** V pořadí hráčů vlastního tréninku. */
  results: SeriesResult[];
}

/** Série vlastního tréninku podle zapsaných výsledků, v pořadí, jak se cvičily. */
export function practiceSeries(t: Training): PracticeSeries[] {
  const byKey = new Map<SoloKey, PracticeSeries>();
  for (const [playerId, values] of Object.entries(t.soloResults))
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === undefined) continue;
      const { metric, round } = parseSoloKey(key);
      if (!round) continue;
      const max = soloMetric(metric)?.max;
      if (max === undefined) continue; // metrika z novější verze appky
      const s = byKey.get(key) ?? { n: round, metric, key, results: [] };
      s.results.push({ playerId, value, attempts: t.soloAttempts?.[playerId]?.[key] ?? max, max });
      byKey.set(key, s);
    }
  const order = (p: PlayerId) => {
    const i = t.attendees.indexOf(p);
    return i < 0 ? t.attendees.length : i;
  };
  return [...byKey.values()]
    .map((s) => ({ ...s, results: s.results.sort((a, b) => order(a.playerId) - order(b.playerId)) }))
    .sort((a, b) => a.n - b.n || (a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : 0));
}

/** Číslo nové série: nejvyšší zapsané + 1. */
export function nextSeriesNo(t: Training): number {
  return practiceSeries(t).reduce((m, s) => Math.max(m, s.n), 0) + 1;
}

/** Varianta série (0 / 1) u cvičení na dvě varianty: střídá se podle dřívějších sérií téže metriky. */
export function seriesVariant(t: Training, metric: SoloMetric, n: number): 0 | 1 {
  return (practiceSeries(t).filter((s) => s.metric === metric && s.n < n).length % 2) as 0 | 1;
}

const startOf = (t: Training) => t.playTimes?.[TRAINING_ITEM]?.startedAt;
const endOf = (t: Training) => t.playTimes?.[TRAINING_ITEM]?.endedAt;

/** Vlastní trénink běží: zahájený, neukončený a zahájený před méně než 12 h. */
export function practiceRunning(t: Training, now: number): boolean {
  const s = startOf(t);
  return s !== undefined && endOf(t) === undefined && now - s < PRACTICE_MAX_AGE_MS;
}

export const practiceEnded = (t: Training, now: number): boolean => !practiceRunning(t, now);

/** Délka vlastního tréninku v minutách; null = neukončený (nebo bez zahájení). */
export function practiceMinutes(t: Training): number | null {
  const s = startOf(t);
  const e = endOf(t);
  return s !== undefined && e !== undefined ? Math.max(0, Math.round((e - s) / 60_000)) : null;
}
