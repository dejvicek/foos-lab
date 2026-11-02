import { drillTimeline, effectiveEvents, matchTimeline } from './timeline';
import type { GameEvent } from './types';

const M = 60_000;
const ev = (at: number, kind: GameEvent['kind'], extra: Partial<GameEvent> = {}): GameEvent => ({ id: `${at}${kind}${extra.side ?? extra.playerId ?? ''}${extra.delta ?? 1}`, itemId: 'm', at: at * M, kind, delta: 1, ...extra });

describe('průběh hry z událostí', () => {
  it('Zpět (−1) ruší poslední stejnou událost; zbytek v časovém pořadí', () => {
    const list = [ev(1, 'goal', { side: 'A' }), ev(2, 'goal', { side: 'B' }), ev(3, 'goal', { side: 'A' }), ev(4, 'goal', { side: 'A', delta: -1 })];
    expect(effectiveEvents(list).map((e) => [e.at / M, e.side])).toEqual([[1, 'A'], [2, 'B']]);
  });

  it('zápas: dvě dráhy – góly s pořadím na straně, ztráty, rozsah času', () => {
    const list = [ev(1, 'goal', { side: 'A' }), ev(2, 'loss', { side: 'A' }), ev(3, 'goal', { side: 'B' }), ev(4, 'goal', { side: 'A' })];
    const tl = matchTimeline(list, 0, 5 * M);
    expect(tl.A.map((x) => [x.kind, x.n])).toEqual([['goal', 1], ['loss', null], ['goal', 2]]);
    expect(tl.B.map((x) => [x.kind, x.n])).toEqual([['goal', 1]]);
    expect(tl.A[0].pos).toBeCloseTo(0.2);
    expect(tl.score).toEqual([2, 1]);
  });

  it('cvičení: řada pokusů po hráči, nejdelší série a poloviny', () => {
    const seq = [true, true, false, true, true, true, false, true];
    const list = seq.map((ok, i) => ev(i + 1, ok ? 'hit' : 'miss', { playerId: 'p1', id: `x${i}` }));
    const d = drillTimeline(list, ['p1', 'p2']);
    expect(d.p1.marks).toEqual(seq);
    expect(d.p1.streak).toEqual({ start: 3, length: 3 });
    expect(d.p1.halves).toEqual([3, 3]); // 1.–4.: 3, 5.–8.: 3
    expect(d.p2.marks).toEqual([]);
  });
});
