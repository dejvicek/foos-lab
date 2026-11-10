import { mergeHead, type Op } from './ops';

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
