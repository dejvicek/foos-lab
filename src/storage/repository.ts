import type { SoloSlot } from '../domain/solo';
import type { LockedRound, MatchId, Player, PlayerId, Score, SimTeams, SoloKey, Training } from '../domain/types';

export interface AppData {
  players: Player[];
  /** Tréninky včetně skóre. */
  trainings: Training[];
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
  /** Hráč zamkne odehraná kola (jen prodloužení) a případně týmy simulace – funkce na serveru. */
  lockRounds(trainingId: string, locked: LockedRound[], simTeams: SimTeams | null): Promise<void>;
  /** Smaže výsledky sólové části tréninku mimo `keep`. */
  replaceSolo(trainingId: string, keep: SoloSlot[]): Promise<void>;
}
