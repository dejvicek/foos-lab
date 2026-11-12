/**
 * Vlastní trénink (PRD 5.11, 11. 11. 2026): hráč cvičí mimo klubový trénink sám nebo ve dvou.
 * Ukládá se jako Training s formátem 'practice' s plánem (vybraná cvičení v pořadí, kola s časem jako
 * v klubovém tréninku). Výsledky jsou výsledky sólové části s klíčem `metrika@n` (n = číslo kola),
 * zahájení a konec tréninku a kol jsou časy utkání `training` a `round|n`.
 */
import { DISCIPLINES, discipline, placesOf, roundMin, type DisciplineDef } from './disciplines';
import { drillCount } from './drillTap';
import { CHANGEOVER_MIN } from './plan';
import { TRAINING_ITEM } from './queue';
import { parseSoloKey, soloKey, soloMetric } from './solo';
import { cleanFormats, formatOf, matchState, withFormat, type MatchFormats } from './matchFormat';
import type { DisciplineId, Match, PlayerId, SoloKey, SoloMetric, Training } from './types';

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

/**
 * Kolik kol má disciplína v plánu: cvičení na dvě varianty dvě kola (každá varianta jedno), párový
 * zápas (Zeď, Start 0:3, 4:5) dvě kola s prohozenými rolemi, jinak jedno.
 */
export const roundsOf = (d: DisciplineDef): number => (d.kind === 'match' ? (d.paired ? 2 : 1) : (d.variants?.length ?? 1));

/** Délka kola v plánu: zápas s BO = délka legu × nejvyšší počet legů. */
const planMin = (d: DisciplineDef, formats?: MatchFormats | null) => d.min * (d.kind === 'match' ? formatOf(formats, d.id).bestOf : 1);

/**
 * Nový vlastní trénink s plánem: vybraná cvičení v pořadí `drills`, kola podle roundsOf, délky kol
 * z aktuálního katalogu (trénink si je nese, pozdější změna katalogu jeho časy nehne).
 */
export function newPractice(
  id: string,
  date: string,
  startTime: string,
  me: PlayerId,
  partner: PlayerId | null = null,
  drills: DisciplineId[] = [],
  formats: MatchFormats | null = null,
): Training {
  const pair = !!partner && partner !== me;
  // Zápasy jen ve dvou (12. 11. 2026).
  // Jen co se sám / ve dvou hraje (placesOf; zápasy jen ve dvou).
  const list = drills.filter((d, i) => drills.indexOf(d) === i && DISCIPLINES.some((x) => x.id === d && (pair ? placesOf(x).duo : placesOf(x).solo)));
  const matchFormats = cleanFormats(Object.fromEntries(Object.entries(formats ?? {}).filter(([d]) => list.includes(d as DisciplineId))));
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
    durationMin: practicePlanMinutes(list, matchFormats),
    plan: Object.fromEntries(list.map((d) => [d, roundsOf(discipline(d))])),
    disciplineOrder: list,
    disciplineMin: Object.fromEntries(list.map((d) => [d, discipline(d).min])),
    lockedRounds: [],
    createdBy: me,
    ...(matchFormats ? { matchFormats } : {}),
  };
}

/** Naplánovaná délka (min): kola cvičení podle katalogu a mezi koly přechod jako v klubovém tréninku. */
export function practicePlanMinutes(drills: DisciplineId[], formats: MatchFormats | null = null): number {
  const rounds = drills.flatMap((id) => Array.from({ length: roundsOf(discipline(id)) }, () => planMin(discipline(id), formats)));
  return rounds.reduce((a, b) => a + b, 0) + Math.max(0, rounds.length - 1) * CHANGEOVER_MIN;
}

/**
 * Nabídka: nevyřazená cvičení s metrikou a Rozcvička; sám jen ta bez bránícího soupeře. Ve dvou i zápasy
 * a scénáře (12. 11. 2026, bez simulace).
 */
export function practiceDrills(players: number): DisciplineDef[] {
  return DISCIPLINES.filter((d) => (players >= 2 ? placesOf(d).duo : placesOf(d).solo));
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
      const def = soloMetric(metric);
      if (!def) continue; // metrika z novější verze appky
      const max = def.max;
      const s = byKey.get(key) ?? { n: round, metric, key, results: [] };
      s.results.push({ playerId, value, attempts: t.soloAttempts?.[playerId]?.[key] ?? (def.streak ? 0 : max), max });
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
  /** Zápas kola (zápasy a scénáře ve dvou); skóre jako v klubovém tréninku, legy `ID#n`. */
  match?: Match;
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
      if (d.kind === 'match') {
        if (t.attendees.length < 2) continue;
        const f = formatOf(t.matchFormats, id);
        out.push({ n, drill: id, match: practiceMatch(t, d, n, v), min: roundMin(id, t.disciplineMin) * f.bestOf, item: roundItem(n) });
        continue;
      }
      out.push({ n, drill: id, metric: practiceMetric(d, t.attendees.length), variant: d.variants?.[v], min: roundMin(id, t.disciplineMin), item: roundItem(n) });
    }
  }
  return out;
}

/**
 * Zápas kola vlastního tréninku: zakladatel vlevo, spoluhráč vpravo; ve druhém kole párového zápasu
 * (Zeď, Start 0:3, 4:5) si strany prohodí role.
 */
function practiceMatch(t: Training, d: DisciplineDef, n: number, k: number): Match {
  const [a, b] = k % 2 ? [t.attendees[1], t.attendees[0]] : [t.attendees[0], t.attendees[1]];
  const m: Match = { id: `practice|${n}|${a}v${b}`, block: 'league', round: n, table: 1, kind: 'singles', sideA: [a], sideB: [b], discipline: d.id, lossTax: !!d.lossTax, trackLosses: true };
  if (d.wall) m.wall = 'A';
  if (d.start) m.start = d.start;
  return withFormat(m, formatOf(t.matchFormats, d.id));
}

/** Klíč výsledku kola; Rozcvička nic nezapisuje. */
export const roundKey = (r: PracticeRound): SoloKey | null => (r.metric ? soloKey(r.metric, r.n) : null);

/** Kolo, které se právě hraje (nebo je na řadě): první neukončené; null = plán dohraný. */
export function currentRound(t: Training): PracticeRound | null {
  return practiceRounds(t).find((r) => t.playTimes?.[r.item]?.endedAt === undefined) ?? null;
}

/** Všichni hráči mají v kole odehrané všechny pokusy (u Čisté desítky: všichni sérii splnili). */
export function roundAttemptsDone(t: Training, r: PracticeRound): boolean {
  if (r.match) return matchState(r.match, t.scores).over; // zápas: rozhodnutý / odehrané legy
  const key = roundKey(r);
  if (!key) return false;
  const def = soloMetric(r.metric!);
  return t.attendees.every((p) => drillCount({ value: t.soloResults[p]?.[key], attempts: t.soloAttempts?.[p]?.[key] }, def).done);
}

/** Zbývající čas kola v sekundách (záporný = přetažené); kolo bez zahájení = celá délka. */
export function roundRemainingSec(t: Training, r: PracticeRound, now: number): number {
  const s = t.playTimes?.[r.item]?.startedAt;
  // Hodiny telefonu chvíli za zahájením (zápis z jiného telefonu) – nikdy víc než celé kolo.
  return s === undefined ? r.min * 60 : Math.min(r.min * 60, Math.ceil(r.min * 60 - (now - s) / 1000));
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

/** Zápasy vlastního tréninku: kolo, zápas a stav po legech (jen kola, kde je něco zapsané). */
export function practiceMatches(t: Training): { round: PracticeRound; match: Match; state: ReturnType<typeof matchState> }[] {
  return practiceRounds(t).flatMap((round) => {
    if (!round.match) return [];
    const state = matchState(round.match, t.scores);
    const any = state.legs.some((l) => l.score?.ga !== undefined && l.score?.gb !== undefined);
    return any ? [{ round, match: round.match, state }] : [];
  });
}

export interface PracticeMatchRow {
  playerId: PlayerId;
  /** Vlastní tréninky se zápasem této disciplíny. */
  trainings: number;
  /** Dohrané zápasy (rozhodnuté nebo všechny legy). */
  matches: number;
  wins: number;
  draws: number;
  legs: number;
  legWins: number;
  gf: number;
  gc: number;
  /** (výhry + ½ remízy) / zápasy */
  rate: number;
}

export interface PracticeMatchTable {
  discipline: DisciplineId;
  ranked: PracticeMatchRow[];
  lowData: PracticeMatchRow[];
}

/**
 * Žebříček Vlastní – zápasy (12. 11. 2026): pro každou zápasovou disciplínu vyhrané zápasy (BO2 remíza
 * = půl), legy a skóre. Řazení: podíl vyhraných zápasů → rozdíl skóre na leg → tréninky; pod 3
 * vlastními tréninky „málo dat“ jako jinde.
 */
export function computePracticeMatchLadder(trainings: Training[], from: string | null, to: string | null, minTrainings: number): PracticeMatchTable[] {
  const acc = new Map<DisciplineId, Map<PlayerId, PracticeMatchRow & { seen: Set<string> }>>();
  for (const t of trainings) {
    if (!isPractice(t) || (from && t.date < from) || (to && t.date > to)) continue;
    for (const { match, state } of practiceMatches(t)) {
      const id = match.discipline!;
      const table = acc.get(id) ?? new Map();
      acc.set(id, table);
      const sides: [PlayerId[], 'A' | 'B'][] = [
        [match.sideA, 'A'],
        [match.sideB, 'B'],
      ];
      for (const [players, side] of sides)
        for (const p of players) {
          const r = table.get(p) ?? { playerId: p, trainings: 0, matches: 0, wins: 0, draws: 0, legs: 0, legWins: 0, gf: 0, gc: 0, rate: 0, seen: new Set<string>() };
          if (!r.seen.has(t.id)) {
            r.seen.add(t.id);
            r.trainings++;
          }
          for (const l of state.legs) {
            if (!l.over) continue;
            const ga = l.score?.ga ?? 0;
            const gb = l.score?.gb ?? 0;
            r.legs++;
            if (l.winner === side) r.legWins++;
            r.gf += side === 'A' ? ga : gb;
            r.gc += side === 'A' ? gb : ga;
          }
          if (state.over) {
            r.matches++;
            if (state.winner === side) r.wins++;
            else if (state.winner === null) r.draws++;
          }
          table.set(p, r);
        }
    }
  }
  const order = DISCIPLINES.map((d) => d.id);
  return [...acc.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([discipline, table]) => {
      const rows = [...table.values()].map(({ seen: _, ...r }) => ({ ...r, rate: r.matches ? (r.wins + r.draws / 2) / r.matches : 0 }));
      const perLeg = (r: PracticeMatchRow) => (r.legs ? (r.gf - r.gc) / r.legs : 0);
      rows.sort((a, b) => b.rate - a.rate || perLeg(b) - perLeg(a) || b.trainings - a.trainings || (a.playerId < b.playerId ? -1 : 1));
      return { discipline, ranked: rows.filter((r) => r.trainings >= minTrainings), lowData: rows.filter((r) => r.trainings < minTrainings) };
    });
}
