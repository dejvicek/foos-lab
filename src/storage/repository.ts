import type { SoloSlot } from '../domain/solo';
import type { LockedRound, MatchId, Player, PlayerId, Score, SimTeams, SoloKey, Training, PlayTime } from '../domain/types';

export interface AppData {
  players: Player[];
  /** Tréninky včetně skóre. */
  trainings: Training[];
}

export interface RemoteHandlers {
  score(trainingId: string, matchId: MatchId, s: Score | null): void;
  solo(trainingId: string, playerId: PlayerId, key: SoloKey, value: number | null, attempts?: number | null): void;
  training(t: Training | null, id: string): void;
  /** Spojení se (znovu) navázalo – zmeškané změny se musí dočíst. */
  resync(): void;
  /** Zahájení / konec utkání (null = smazáno). */
  playTime(trainingId: string, itemId: string, p: PlayTime | null): void;
}

export interface Repository {
  loadAll(): Promise<AppData>;
  savePlayer(p: Player): Promise<void>;
  deletePlayer(id: PlayerId): Promise<void>;
  /** Uloží konfiguraci tréninku; skóre nemění. */
  saveTraining(t: Training): Promise<void>;
  /** Smaže trénink i jeho skóre. */
  deleteTraining(id: string): Promise<void>;
  /** Prázdné skóre řádek smaže, jinak upsert. */
  saveScore(trainingId: string, matchId: MatchId, s: Score): Promise<void>;
  /** Smaže skóre tréninku, jejichž match_id není v `keep`. */
  replaceScores(trainingId: string, keep: MatchId[]): Promise<void>;
  /** Výsledek sólové části; null řádek smaže. */
  saveSolo(trainingId: string, playerId: PlayerId, key: SoloKey, value: number | null): Promise<void>;
  /** Ťuknutí: přičte delta k poli skóre (atomicky v databázi), výsledek v mezích 0…max. */
  bumpScore(trainingId: string, matchId: MatchId, field: keyof Score, delta: number, max: number): Promise<void>;
  /** Ťuknutí ve cvičení: přičte delta k výsledku hráče, v mezích 0…max. */
  bumpSolo(trainingId: string, playerId: PlayerId, key: SoloKey, delta: number, max: number): Promise<void>;
  /** Ťuknutí po pokusu cvičení: přičte k výsledku i k pokusům (v mezích 0…max). */
  tapSolo(trainingId: string, playerId: PlayerId, key: SoloKey, dValue: number, dAttempts: number, max: number): Promise<void>;
  /** Živé změny od ostatních telefonů; vrací odhlášení. */
  subscribe(handlers: RemoteHandlers): () => void;
  /** Zdržovači: zahájení a konec utkání; null nebo prázdné smaže. */
  savePlayTime(trainingId: string, itemId: string, p: PlayTime | null): Promise<void>;
  /** Hráč zamkne odehraná kola (jen prodloužení) a případně týmy simulace – funkce na serveru. */
  lockRounds(trainingId: string, locked: LockedRound[], simTeams: SimTeams | null): Promise<void>;
  /** Smaže výsledky sólové části tréninku mimo `keep`. */
  replaceSolo(trainingId: string, keep: SoloSlot[]): Promise<void>;
}
