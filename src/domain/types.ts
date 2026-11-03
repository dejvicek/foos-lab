export type PlayerId = string;
export type MatchId = string;
export type Mode = 'team' | 'single';
export type TableCount = 1 | 2 | 3 | 4;

export interface Player {
  id: PlayerId;
  name: string;
  archived: boolean;
  order: number;
}

/** Skóre zápasu: ga/gb góly (u simulace sety 0..2), la/lb ztráty. */
export interface Score {
  ga?: number | null;
  gb?: number | null;
  la?: number | null;
  lb?: number | null;
}

export type SoloMetric =
  | 'warmupPasses'
  | 'passWallLane'
  | 'fiveBarControl'
  | 'fiveBarSolo'
  | 'setShooting'
  | 'penaltyKeeper'
  | 'penaltySolo'
  | 'backShotKeeper'
  | 'backShotSolo'
  | 'blockToControl'
  | 'clearing'
  | 'looseBall'
  | 'backRodsBuildUp'
  | 'chain';
/** Klíč výsledku: `metrika` (klasický trénink) nebo `metrika@kolo` (konfigurovatelný). */
export type SoloKey = string;
/** Výsledky sólové části: hráč → klíč → hodnota (PRD 5.8, 6). */
export type SoloResults = Record<PlayerId, Record<SoloKey, number>>;

/** Jak rozdělit přítomné na týmy simulace ligového kola. */
export type SimSplit = 'performance' | 'order' | 'manual';
export interface SimTeams {
  A: PlayerId[];
  B: PlayerId[];
}

export type TrainingFormat = 'classic' | 'custom';
export type DisciplineId =
  | SoloMetric
  | 'normal'
  | 'lossTax'
  | 'wall'
  | 'start03'
  | 'start44'
  | 'start45'
  | 'start55'
  | 'singles'
  | 'sim';
export interface LockedRound {
  discipline: DisciplineId;
  /** Řádky kola (simulace má 2 vlny). */
  rows: ScheduleRow[];
}

export interface Training {
  id: string;
  date: string; // YYYY-MM-DD
  /** Skutečný čas začátku 'HH:MM'. */
  startTime: string;
  mode: Mode;
  tables: TableCount;
  /** Přítomní v nominačním pořadí. */
  attendees: PlayerId[];
  scores: Record<MatchId, Score>;
  soloResults: SoloResults;
  /** Výchozí 'performance': vyrovnaně podle výkonu ve scénářové lize tohoto tréninku. */
  simSplit: SimSplit;
  /** Ruční týmy, nebo zamčené týmy (od prvního zapsaného výsledku simulace); jinak null. */
  simTeams: SimTeams | null;
  /** 'classic' = pevná struktura PRD 4.1–4.3, 'custom' = disciplíny PRD 4.6. */
  format: TrainingFormat;
  /** Délka tréninku v minutách (custom). */
  durationMin: number;
  /** Počet kol každé disciplíny (custom). */
  plan: Partial<Record<DisciplineId, number>>;
  /** Zamčená (odehraná) kola – jejich sestavy se už nemění (custom). */
  lockedRounds: LockedRound[];
  /** Vlastní pauzy (konfigurovatelný trénink); chybí / null = automaticky 10 min po každé hodině. */
  breaks?: BreakDef[] | null;
  /** Odehrané pokusy cvičení (stejné klíče jako soloResults); chybí = zapsáno číslem = plný počet. */
  soloAttempts?: SoloResults;
  /** Události her (průběh, PRD 4.9); chybí = nic neťukáno. */
  events?: GameEvent[];
  /** Zahájení a konce utkání (Zdržovači); chybí = nic neměřeno. */
  playTimes?: PlayTimes;
  /** Hráč, který trénink založil – má u něj práva admina (PRD 4.7); null = starší trénink. */
  createdBy?: PlayerId | null;
  notes?: string;
}

export type Block = 'league' | 'sim';
export type MatchKind = 'doubles' | 'singles';

export interface Match {
  id: MatchId;
  block: Block;
  round: number;
  table: number;
  kind: MatchKind;
  sideA: PlayerId[];
  sideB: PlayerId[];
  /** Rozhodčí u stolu (čekající hráči popořadě ke stolům 1, 2, …). */
  referee?: PlayerId;
  /** Zapisují se ztráty: jen mimo Daň a jen u stolu s rozhodčím. */
  trackLosses?: boolean;
  /** Kolo s Daní za ztrátu. */
  lossTax?: boolean;
  /** Strana, která hraje Zeď. */
  wall?: 'A' | 'B';
  /** Scénářový start [levá, pravá]; zapisují se jen odehrané góly. */
  start?: [number, number];
  /** Disciplína kola (konfigurovatelný trénink). */
  discipline?: DisciplineId;
}

export type Cell =
  | { type: 'group'; players: PlayerId[]; station?: string; metric?: SoloMetric; soloRound?: number; discipline?: DisciplineId }
  | { type: 'match'; match: Match };

/** Zahájení a konec utkání (ms od epochy) – Zdržovači (PRD 4.8). */
export interface PlayTime {
  startedAt?: number;
  endedAt?: number;
}
/** Klíč: ID zápasu, u cvičení `drill|kolo|stůl|hráči`. */
export type PlayTimes = Record<string, PlayTime>;

/**
 * Událost hry (PRD 4.9): jedno ťuknutí s časem. Seznam se jen doplňuje; „Zpět“ = stejná událost s delta −1,
 * která zruší poslední odpovídající. Zápas: goal / loss se stranou A/B; cvičení: hit / miss s hráčem.
 */
export interface GameEvent {
  id: string;
  itemId: string;
  at: number;
  kind: 'goal' | 'loss' | 'hit' | 'miss';
  side?: 'A' | 'B';
  playerId?: PlayerId;
  delta: 1 | -1;
}

/** Pauza: po kolika kolech (1 = po kole 1) a jak dlouhá v minutách. */
export interface BreakDef {
  after: number;
  min: number;
}

export interface ScheduleRow {
  /** Pauza: index v seznamu pauz tréninku (jen konfigurovatelný trénink). */
  breakIndex?: number;
  /** Pořadové číslo hracího kola (konfigurovatelný trénink). */
  roundNo?: number;
  /** Disciplína kola (konfigurovatelný trénink). */
  discipline?: DisciplineId;
  time: number; // minuty od začátku tréninku
  label: string;
  rule?: string;
  kind: 'groups' | 'matches' | 'break';
  cells: (Cell | null)[];
  waiting: PlayerId[];
}

export interface ScheduleSection {
  id: 'solo' | 'league' | 'sim' | 'singles' | 'drills' | 'matches';
  title: string;
  subtitle?: string;
  waitingLabel: string;
  rows: ScheduleRow[];
}

export interface ScheduleSummary {
  stationGroups: number;
  doublesPerRound: number;
  singlesPerRound: number;
  waitingPerRound: number;
  simDoubles: number;
  simSingles: number;
}

export interface Schedule {
  mode: Mode;
  tables: TableCount;
  sections: ScheduleSection[];
  matches: Match[];
  teams: { A: PlayerId[]; B: PlayerId[] } | null;
  summary: ScheduleSummary;
}
