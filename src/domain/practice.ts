/**
 * Vlastní trénink (PRD 5.11, 11. 11. 2026): hráč cvičí mimo klubový trénink sám nebo ve dvou.
 * Ukládá se jako Training s formátem 'practice' s plánem (vybraná cvičení v pořadí, kola s časem jako
 * v klubovém tréninku). Výsledky jsou výsledky sólové části s klíčem `metrika@n` (n = číslo kola),
 * zahájení a konec tréninku a kol jsou časy utkání `training` a `round|n`.
 */
import { DISCIPLINES, discipline, roundMin, type DisciplineDef } from './disciplines';
import { drillCount } from './drillTap';
import { CHANGEOVER_MIN } from './plan';
import { TRAINING_ITEM } from './queue';
import { parseSoloKey, soloKey, soloMetric } from './solo';
import type { DisciplineId, PlayerId, SoloKey, SoloMetric, Training } from './types';

export const PRACTICE_MAX_PLAYERS = 2;
/** Neukončený vlastní trénink zahájený před víc než 12 h se bere jako skončený (zapomenuté „Ukončit“). */
export const PRACTICE_MAX_AGE_MS = 12 * 3_600_000;

export const isPractice = (t: Pick<Training, 'format'>): boolean => t.format === 'practice';
/** Klubový trénink (klasický nebo konfigurovatelný) – jen ty se počítají do klubových žebříčků a docházky. */
export const isClub = (t: Pick<Training, 'format'>): boolean => !isPractice(t);

export const clubTrainings = (ts: Training[]): Training[] => ts.filter(isClub);

/**
 * Vlastní tréninky, které hráč vidí v seznamu: kde cvičil; admin všechny (smí je mazat).
 * Nejnovější nahoře (datum, pak čas začátku).
 */
export function practicesFor(ts: Training[], playerId: PlayerId | null, all = false): Training[] {
  return ts
    .filter((t) => isPractice(t) && (all || (playerId !== null && t.attendees.includes(playerId))))
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.startTime < b.startTime ? 1 : a.startTime > b.startTime ? -1 : 0));
}

/** Kolik kol má cvičení v plánu: na dvě varianty dvě kola (každá varianta jedno), jinak jedno. */
export const roundsOf = (d: DisciplineDef): number => d.variants?.length ?? 1;

/**
 * Nový vlastní trénink s plánem: vybraná cvičení v pořadí `drills`, kola podle roundsOf, délky kol
 * z aktuálního katalogu (trénink si je nese, pozdější změna katalogu jeho časy nehne).
 */
export function newPractice(id: string, date: string, startTime: string, me: PlayerId, partner: PlayerId | null = null, drills: DisciplineId[] = []): Training {
  const list = drills.filter((d, i) => drills.indexOf(d) === i && DISCIPLINES.some((x) => x.id === d));
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
    durationMin: practicePlanMinutes(list),
    plan: Object.fromEntries(list.map((d) => [d, roundsOf(discipline(d))])),
    disciplineOrder: list,
    disciplineMin: Object.fromEntries(list.map((d) => [d, discipline(d).min])),
    lockedRounds: [],
    createdBy: me,
  };
}

/** Naplánovaná délka (min): kola cvičení podle katalogu a mezi koly přechod jako v klubovém tréninku. */
export function practicePlanMinutes(drills: DisciplineId[]): number {
  const rounds = drills.flatMap((id) => Array.from({ length: roundsOf(discipline(id)) }, () => discipline(id).min));
  return rounds.reduce((a, b) => a + b, 0) + Math.max(0, rounds.length - 1) * CHANGEOVER_MIN;
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

export interface PracticeRound {
  /** Číslo kola (1, 2, …) = n v klíči výsledku `metrika@n`. */
  n: number;
  drill: DisciplineId;
  /** Metrika kola; Rozcvička žádnou nemá. */
  metric?: SoloMetric;
  /** Varianta kola u cvičení na dvě varianty. */
  variant?: string;
  min: number;
  /** Klíč časů kola (zahájení / konec). */
  item: string;
}

export const roundItem = (n: number): string => `round|${n}`;

/** Kola plánu vlastního tréninku v pořadí (cvičení podle disciplineOrder, varianty po sobě). */
export function practiceRounds(t: Training): PracticeRound[] {
  const out: PracticeRound[] = [];
  for (const id of t.disciplineOrder ?? []) {
    const d = DISCIPLINES.find((x) => x.id === id);
    if (!d) continue; // cvičení z novější verze appky
    for (let v = 0; v < (t.plan[id] ?? 0); v++) {
      const n = out.length + 1;
      out.push({ n, drill: id, metric: practiceMetric(d, t.attendees.length), variant: d.variants?.[v], min: roundMin(id, t.disciplineMin), item: roundItem(n) });
    }
  }
  return out;
}

/** Klíč výsledku kola; Rozcvička nic nezapisuje. */
export const roundKey = (r: PracticeRound): SoloKey | null => (r.metric ? soloKey(r.metric, r.n) : null);

/** Kolo, které se právě hraje (nebo je na řadě): první neukončené; null = plán dohraný. */
export function currentRound(t: Training): PracticeRound | null {
  return practiceRounds(t).find((r) => t.playTimes?.[r.item]?.endedAt === undefined) ?? null;
}

/** Všichni hráči mají v kole odehrané všechny pokusy. */
export function roundAttemptsDone(t: Training, r: PracticeRound): boolean {
  const key = roundKey(r);
  if (!key) return false;
  const def = soloMetric(r.metric!);
  return t.attendees.every((p) => drillCount({ value: t.soloResults[p]?.[key], attempts: t.soloAttempts?.[p]?.[key] }, def).done);
}

/** Zbývající čas kola v sekundách (záporný = přetažené); kolo bez zahájení = celá délka. */
export function roundRemainingSec(t: Training, r: PracticeRound, now: number): number {
  const s = t.playTimes?.[r.item]?.startedAt;
  return s === undefined ? r.min * 60 : Math.ceil(r.min * 60 - (now - s) / 1000);
}

/** Pevný plán: do dalšího kola, až uplyne čas kola, nebo když jsou odehrané všechny pokusy. */
export const canAdvance = (t: Training, r: PracticeRound, now: number): boolean =>
  roundRemainingSec(t, r, now) <= 0 || roundAttemptsDone(t, r);

/**
 * Hodiny kol: odehraná podle skutečných časů, hrané od zahájení (konec nejdřív teď), další navazují
 * s přechodem. Bez zahájeného kola se počítá od `now`.
 */
export function roundTimes(t: Training, now: number): { round: PracticeRound; start: number; end: number; state: 'done' | 'playing' | 'next' }[] {
  let next = now;
  return practiceRounds(t).map((round) => {
    const p = t.playTimes?.[round.item];
    if (p?.endedAt !== undefined) {
      const start = p.startedAt ?? p.endedAt;
      next = p.endedAt + CHANGEOVER_MIN * 60_000;
      return { round, start, end: p.endedAt, state: 'done' as const };
    }
    if (p?.startedAt !== undefined) {
      const end = Math.max(p.startedAt + round.min * 60_000, now);
      next = end + CHANGEOVER_MIN * 60_000;
      return { round, start: p.startedAt, end, state: 'playing' as const };
    }
    const start = Math.max(next, now);
    next = start + (round.min + CHANGEOVER_MIN) * 60_000;
    return { round, start, end: start + round.min * 60_000, state: 'next' as const };
  });
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
