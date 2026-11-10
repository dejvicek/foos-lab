import type { CatalogData } from '../domain/catalog';
import type { SoloSlot } from '../domain/solo';
import type { LockedRound, MatchId, Player, PlayerId, Score, SimTeams, SoloKey, Training, PlayTime, GameEvent } from '../domain/types';

export interface AppData {
  players: Player[];
  /** Tréninky včetně skóre. */
  trainings: Training[];
  /** Katalog disciplín a štítků (úpravy admina); chybí = výchozí. */
  catalog?: CatalogData;
}

/**
 * Jedno ťuknutí do skóre. `id` je zároveň ID události průběhu hry: databáze ťuknutí se stejným ID
 * podruhé nezapočítá, takže zápis jde po chybě sítě bezpečně opakovat.
 */
export interface ScoreTap {
  id: string;
  /** Kdy hráč ťukl (ms, hodiny zařízení). */
  at: number;
  field: keyof Score;
  delta: number;
  /** Strop pole (konec legu) – hlídá ho i databáze. */
  max: number;
}

/** Jeden pokus cvičení ✓ / ✗ (delta −1 = vrácení); `id` = ID události, stejně jako u ScoreTap. */
export interface DrillTap {
  id: string;
  at: number;
  /** Utkání (stůl) cvičení, ke kterému událost patří. */
  itemId: string;
  ok: boolean;
  delta: 1 | -1;
  /** O kolik se změní výsledek a počet pokusů. */
  dValue: number;
  dAttempts: number;
}

/** Výsledek cvičení hráče po zápisu; attempts null = zapsáno číslem (plný počet pokusů). */
export interface DrillResult {
  value: number;
  attempts: number | null;
}

export interface RemoteHandlers {
  score(trainingId: string, matchId: MatchId, s: Score | null): void;
  solo(trainingId: string, playerId: PlayerId, key: SoloKey, value: number | null, attempts?: number | null): void;
  training(t: Training | null, id: string): void;
  /** Spojení se (znovu) navázalo – zmeškané změny se musí dočíst. */
  resync(): void;
  /** Zahájení / konec utkání (null = smazáno). */
  playTime(trainingId: string, itemId: string, p: PlayTime | null): void;
  /** Nová událost hry (průběh). */
  event(trainingId: string, e: GameEvent): void;
}

export interface Repository {
  /**
   * Hráči, katalog a tréninky se skóre, výsledky cvičení a časy utkání – bez průběhu her (události).
   * Průběh je zdaleka největší a je potřeba jen u tréninku na obrazovce: loadEvents.
   */
  loadAll(): Promise<AppData>;
  /** Průběh her jednoho tréninku (události ťuknutí). */
  loadEvents(trainingId: string): Promise<GameEvent[]>;
  /** Všechno včetně průběhu všech her – pro zálohu. */
  loadBackup(): Promise<AppData>;
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
  /**
   * Ťuknutí do skóre (i víc najednou) včetně událostí průběhu hry – jeden zápis, v databázi atomicky,
   * výsledek v mezích 0…max. Ťuknutí se známým ID se nezapočítá podruhé. Vrací stav zápasu po zápisu.
   */
  tapScore(trainingId: string, matchId: MatchId, taps: ScoreTap[]): Promise<Score>;
  /** Pokusy cvičení ✓ / ✗ včetně událostí; stejná pravidla opakování jako tapScore. Vrací výsledek po zápisu. */
  tapDrill(trainingId: string, playerId: PlayerId, key: SoloKey, max: number, taps: DrillTap[]): Promise<DrillResult>;
  /** Živé změny od ostatních telefonů; vrací odhlášení. */
  subscribe(handlers: RemoteHandlers): () => void;
  /**
   * Celý řádek časů utkání (null nebo prázdné smaže). Přepisuje zahájení i konec – jen pro mazání
   * a opravy; běžné Zahájit / Ukončit jde přes startItem / endItem.
   */
  savePlayTime(trainingId: string, itemId: string, p: PlayTime | null): Promise<void>;
  /** Zahájení utkání: čas se zapíše, jen když ještě žádný není; konec nemění. Vrací časy po zápisu. */
  startItem(trainingId: string, itemId: string, at: number): Promise<PlayTime>;
  /** Konec utkání: konec (a chybějící zahájení) se zapíše, jen když ještě není. Vrací časy po zápisu. */
  endItem(trainingId: string, itemId: string, startedAt: number | undefined, endedAt: number): Promise<PlayTime>;
  /** Hráč zamkne odehraná kola (jen prodloužení) a případně týmy simulace – funkce na serveru. */
  lockRounds(trainingId: string, locked: LockedRound[], simTeams: SimTeams | null): Promise<void>;
  /** Smaže výsledky sólové části tréninku mimo `keep`. */
  replaceSolo(trainingId: string, keep: SoloSlot[]): Promise<void>;
  /** Katalog disciplín (jen admin); ukládá se celý. */
  saveCatalog(c: CatalogData): Promise<void>;
}
