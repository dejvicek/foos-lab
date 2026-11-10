import type { CatalogData } from '../domain/catalog';
import type { SoloSlot } from '../domain/solo';
import type { LockedRound, MatchId, Player, PlayerId, PlayTime, Score, SimTeams, SoloKey, Training } from '../domain/types';
import type { DrillTap, Repository, ScoreTap } from './repository';

/** Čeho se zápis týká – ozvěna ze serveru k témuž klíči nepřepíše změnu, která ještě čeká na uložení. */
export const pendingKey = {
  score: (tid: string, mid: string) => `${tid}::${mid}`,
  solo: (tid: string, pid: string, key: string) => `${tid}::solo::${pid}::${key}`,
  training: (tid: string) => `${tid}::training`,
  time: (tid: string, itemId: string) => `${tid}::time::${itemId}`,
  players: 'players',
  catalog: 'catalog',
};

/**
 * Zápis do úložiště jako data (ne funkce): fronta zápisů se dá vypsat, zopakovat a uložit v zařízení.
 * Každý zápis musí jít zopakovat se stejným výsledkem (upsert, mazání, ťuknutí s ID události).
 */
export type Op =
  | { kind: 'savePlayer'; player: Player }
  | { kind: 'deletePlayer'; id: PlayerId }
  | { kind: 'saveCatalog'; catalog: CatalogData }
  /** Jen konfigurace – skóre, výsledky, časy a události se v tréninku neposílají. */
  | { kind: 'saveTraining'; training: Training }
  | { kind: 'deleteTraining'; id: string }
  | { kind: 'lockRounds'; trainingId: string; locked: LockedRound[]; simTeams: SimTeams | null }
  | { kind: 'replaceScores'; trainingId: string; keep: MatchId[] }
  | { kind: 'replaceSolo'; trainingId: string; keep: SoloSlot[] }
  | { kind: 'saveScore'; trainingId: string; matchId: MatchId; score: Score }
  | { kind: 'saveSolo'; trainingId: string; playerId: PlayerId; key: SoloKey; value: number | null }
  | { kind: 'tapScore'; trainingId: string; matchId: MatchId; taps: ScoreTap[] }
  | { kind: 'tapDrill'; trainingId: string; playerId: PlayerId; key: SoloKey; max: number; taps: DrillTap[] }
  | { kind: 'startItem'; trainingId: string; itemId: string; at: number }
  | { kind: 'endItem'; trainingId: string; itemId: string; startedAt?: number; endedAt: number }
  | { kind: 'savePlayTime'; trainingId: string; itemId: string; time: PlayTime | null };

/** Konfigurace tréninku bez toho, co se ukládá zvlášť (skóre, výsledky, časy, události). */
export function configOf(t: Training): Training {
  const { soloAttempts: _a, events: _e, playTimes: _p, ...rest } = t;
  return { ...rest, scores: {}, soloResults: {} };
}

export function opKey(op: Op): string {
  switch (op.kind) {
    case 'savePlayer':
    case 'deletePlayer':
      return pendingKey.players;
    case 'saveCatalog':
      return pendingKey.catalog;
    case 'saveTraining':
      return pendingKey.training(op.training.id);
    case 'deleteTraining':
      return pendingKey.training(op.id);
    case 'lockRounds':
    case 'replaceScores':
    case 'replaceSolo':
      return pendingKey.training(op.trainingId);
    case 'saveScore':
    case 'tapScore':
      return pendingKey.score(op.trainingId, op.matchId);
    case 'saveSolo':
    case 'tapDrill':
      return pendingKey.solo(op.trainingId, op.playerId, op.key);
    case 'startItem':
    case 'endItem':
    case 'savePlayTime':
      return pendingKey.time(op.trainingId, op.itemId);
  }
}

/** Provede zápis v úložišti. */
export async function runOp(repo: Repository, op: Op): Promise<void> {
  switch (op.kind) {
    case 'savePlayer':
      return repo.savePlayer(op.player);
    case 'deletePlayer':
      return repo.deletePlayer(op.id);
    case 'saveCatalog':
      return repo.saveCatalog(op.catalog);
    case 'saveTraining':
      return repo.saveTraining(op.training);
    case 'deleteTraining':
      return repo.deleteTraining(op.id);
    case 'lockRounds':
      return repo.lockRounds(op.trainingId, op.locked, op.simTeams);
    case 'replaceScores':
      return repo.replaceScores(op.trainingId, op.keep);
    case 'replaceSolo':
      return repo.replaceSolo(op.trainingId, op.keep);
    case 'saveScore':
      return repo.saveScore(op.trainingId, op.matchId, op.score);
    case 'saveSolo':
      return repo.saveSolo(op.trainingId, op.playerId, op.key, op.value);
    case 'tapScore':
      await repo.tapScore(op.trainingId, op.matchId, op.taps);
      return;
    case 'tapDrill':
      await repo.tapDrill(op.trainingId, op.playerId, op.key, op.max, op.taps);
      return;
    case 'startItem':
      await repo.startItem(op.trainingId, op.itemId, op.at);
      return;
    case 'endItem':
      await repo.endItem(op.trainingId, op.itemId, op.startedAt, op.endedAt);
      return;
    case 'savePlayTime':
      return repo.savePlayTime(op.trainingId, op.itemId, op.time);
  }
}
