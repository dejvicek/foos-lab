import type { CatalogData } from '../domain/catalog';
import type { SoloSlot } from '../domain/solo';
import type { LockedRound, MatchId, Player, PlayerId, PlayTime, Score, SimTeams, SoloKey, Training } from '../domain/types';
import { StorageError } from './errors';
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

/**
 * První zápis fronty, případně spojený s ťuknutími, která jdou hned za ním do téhož zápasu / cvičení:
 * série čekající na spojení odejde jedním zápisem (Daň za ztrátu = ztráta + gól soupeře, rychlé ťukání).
 * Jiný zápis se nepřeskakuje – pořadí fronty zůstává. `count` = kolik zápisů fronty spojený zápis pokrývá.
 */
export function mergeHead(ops: Op[]): { op: Op; count: number } {
  const head = ops[0];
  let count = 1;
  if (head.kind === 'tapScore') {
    const taps = [...head.taps];
    for (; count < ops.length; count++) {
      const next = ops[count];
      if (next.kind !== 'tapScore' || next.trainingId !== head.trainingId || next.matchId !== head.matchId) break;
      taps.push(...next.taps);
    }
    return count > 1 ? { op: { ...head, taps }, count } : { op: head, count };
  }
  if (head.kind === 'tapDrill') {
    const taps = [...head.taps];
    for (; count < ops.length; count++) {
      const next = ops[count];
      if (next.kind !== 'tapDrill' || next.trainingId !== head.trainingId || next.playerId !== head.playerId || next.key !== head.key || next.max !== head.max) break;
      taps.push(...next.taps);
    }
    return count > 1 ? { op: { ...head, taps }, count } : { op: head, count };
  }
  return { op: head, count };
}

/**
 * Stav po zápisu, jak ho vrátil server – včetně změn z jiných telefonů. Appka ho převezme, jakmile
 * k témuž klíči nečeká další vlastní zápis (živá změna mohla mezitím dorazit dřív a být zahozena).
 */
export type OpResult =
  | { kind: 'score'; trainingId: string; matchId: MatchId; score: Score }
  | { kind: 'solo'; trainingId: string; playerId: PlayerId; key: SoloKey; value: number; attempts: number | null }
  | { kind: 'playTime'; trainingId: string; itemId: string; time: PlayTime };

/** Provede zápis v úložišti; u ťuknutí a časů utkání vrací stav po zápisu. */
export async function runOp(repo: Repository, op: Op): Promise<OpResult | undefined> {
  switch (op.kind) {
    case 'savePlayer':
      return void (await repo.savePlayer(op.player));
    case 'deletePlayer':
      return void (await repo.deletePlayer(op.id));
    case 'saveCatalog':
      return void (await repo.saveCatalog(op.catalog));
    case 'saveTraining':
      return void (await repo.saveTraining(op.training));
    case 'deleteTraining':
      return void (await repo.deleteTraining(op.id));
    case 'lockRounds':
      return void (await repo.lockRounds(op.trainingId, op.locked, op.simTeams));
    case 'replaceScores':
      return void (await repo.replaceScores(op.trainingId, op.keep));
    case 'replaceSolo':
      return void (await repo.replaceSolo(op.trainingId, op.keep));
    case 'saveScore':
      return void (await repo.saveScore(op.trainingId, op.matchId, op.score));
    case 'saveSolo':
      return void (await repo.saveSolo(op.trainingId, op.playerId, op.key, op.value));
    case 'tapScore':
      return { kind: 'score', trainingId: op.trainingId, matchId: op.matchId, score: await repo.tapScore(op.trainingId, op.matchId, op.taps) };
    case 'tapDrill':
      return { kind: 'solo', trainingId: op.trainingId, playerId: op.playerId, key: op.key, ...(await repo.tapDrill(op.trainingId, op.playerId, op.key, op.max, op.taps)) };
    case 'startItem':
      return { kind: 'playTime', trainingId: op.trainingId, itemId: op.itemId, time: await repo.startItem(op.trainingId, op.itemId, op.at) };
    case 'endItem':
      return { kind: 'playTime', trainingId: op.trainingId, itemId: op.itemId, time: await repo.endItem(op.trainingId, op.itemId, op.startedAt, op.endedAt) };
    case 'savePlayTime':
      return void (await repo.savePlayTime(op.trainingId, op.itemId, op.time));
    default:
      // Zápis z fronty uložené jinou verzí appky.
      throw new StorageError(`Neznámý zápis ${(op as { kind: string }).kind}`, true, 'zápis z jiné verze appky');
  }
}
