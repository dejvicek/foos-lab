import { mergeHead, opKey, runOp, type Op } from './ops';
import { memoryRepository } from './memoryRepository';
import type { Training } from '../domain/types';

const goal = (id: string, matchId = 'm1', trainingId = 't1'): Op => ({ kind: 'tapScore', trainingId, matchId, taps: [{ id, at: 1, field: 'ga', delta: 1, max: 6 }] });
const hit = (id: string, playerId = 'p1', key = 'chain@1'): Op => ({ kind: 'tapDrill', trainingId: 't1', playerId, key, max: 20, taps: [{ id, at: 1, itemId: 'drill|x', ok: true, delta: 1, dValue: 1, dAttempts: 1 }] });
const ids = (op: Op) => (op.kind === 'tapScore' || op.kind === 'tapDrill' ? op.taps.map((t) => t.id) : []);

describe('mergeHead – ťuknutí čekající ve frontě odejdou jedním zápisem', () => {
  it('spojí ťuknutí do téhož zápasu, která jdou hned po sobě', () => {
    const { op, count } = mergeHead([goal('a'), goal('b'), goal('c'), goal('d', 'm2'), goal('e')]);
    expect(count).toBe(3);
    expect(ids(op)).toEqual(['a', 'b', 'c']);
  });

  it('nepřeskakuje jiný zápis – pořadí fronty se zachová', () => {
    const start: Op = { kind: 'startItem', trainingId: 't1', itemId: 'm1', at: 5 };
    expect(mergeHead([goal('a'), start, goal('b')]).count).toBe(1);
    expect(mergeHead([goal('a'), goal('b', 'm1', 't2')]).count).toBe(1);
  });

  it('spojí pokusy téhož hráče v témže cvičení', () => {
    const { op, count } = mergeHead([hit('a'), hit('b'), hit('c', 'p2'), hit('d')]);
    expect(count).toBe(2);
    expect(ids(op)).toEqual(['a', 'b']);
    expect(mergeHead([hit('a'), hit('b', 'p1', 'chain@2')]).count).toBe(1);
  });

  it('ostatní zápisy jdou po jednom', () => {
    const save: Op = { kind: 'savePlayer', player: { id: 'a', name: 'A', archived: false, order: 0 } };
    expect(mergeHead([save, save])).toEqual({ op: save, count: 1 });
  });

  it('vstupní zápisy nemění', () => {
    const a = goal('a');
    mergeHead([a, goal('b')]);
    expect(ids(a)).toEqual(['a']);
  });
});

describe('ťuknutí se zahájením (20. 11. 2026)', () => {
  it('spojená ťuknutí si nechají nejdřívější zahájení', () => {
    const a: Op = { kind: 'tapScore', trainingId: 't1', matchId: 'm1', taps: [{ id: 'a', at: 5, field: 'ga', delta: 1, max: 6 }], start: { itemId: 'm1', at: 5 } };
    const merged = mergeHead([a, goal('b')]);
    expect(merged.count).toBe(2);
    expect(merged.op).toMatchObject({ start: { itemId: 'm1', at: 5 } });
    expect(mergeHead([goal('c'), goal('d')]).op).not.toHaveProperty('start');
  });

  it('runOp: po přičtení zahájí zápas časem ťuknutí; už zahájený si začátek nechá', async () => {
    const t = { id: 't1', date: '2026-11-20', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan: {}, lockedRounds: [], mode: 'team', tables: 2, attendees: [], scores: {} } as unknown as Training;
    const repo = memoryRepository({ players: [], trainings: [t] });
    await runOp(repo, { kind: 'tapScore', trainingId: 't1', matchId: 'm1#2', taps: [{ id: 'x', at: 1000, field: 'ga', delta: 1, max: 6 }], start: { itemId: 'm1', at: 1000 } });
    expect(repo.snapshot().trainings[0].playTimes).toEqual({ m1: { startedAt: 1000 } });
    await runOp(repo, { kind: 'tapScore', trainingId: 't1', matchId: 'm1', taps: [{ id: 'y', at: 2000, field: 'ga', delta: 1, max: 6 }], start: { itemId: 'm1', at: 2000 } });
    expect(repo.snapshot().trainings[0].playTimes).toEqual({ m1: { startedAt: 1000 } });
  });
});

describe('setAvatar – fotka hráče', () => {
  const honza = { id: 'p1', name: 'Honza', archived: false, order: 0 };

  it('nastaví a smaže fotku; úprava hráče ji nepřepíše', async () => {
    const repo = memoryRepository({ players: [honza], trainings: [] });
    await runOp(repo, { kind: 'setAvatar', playerId: 'p1', image: 'data:image/webp;base64,AA==' });
    await runOp(repo, { kind: 'savePlayer', player: { ...honza, name: 'Honzík' } });
    expect((await repo.loadAll()).players[0]).toEqual({ ...honza, name: 'Honzík', avatar: 'data:image/webp;base64,AA==' });
    await runOp(repo, { kind: 'setAvatar', playerId: 'p1', image: null });
    expect((await repo.loadAll()).players[0]).toEqual({ ...honza, name: 'Honzík' });
  });

  it('jde opakovat se stejným výsledkem', async () => {
    const repo = memoryRepository({ players: [honza], trainings: [] });
    const op: Op = { kind: 'setAvatar', playerId: 'p1', image: 'data:image/webp;base64,AA==' };
    await runOp(repo, op);
    await runOp(repo, op);
    expect((await repo.loadAll()).players[0].avatar).toBe('data:image/webp;base64,AA==');
  });

  it('patří k hráčům (ozvěna soupisky nepřepíše čekající fotku)', () => {
    expect(opKey({ kind: 'setAvatar', playerId: 'p1', image: null })).toBe('players');
  });
});
