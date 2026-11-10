import { drillTimeline, effectiveEvents, leader, matchProgress } from './timeline';
import type { GameEvent } from './types';

const M = 60_000;
const ev = (at: number, kind: GameEvent['kind'], extra: Partial<GameEvent> = {}): GameEvent => ({ id: `${at}${kind}${extra.side ?? extra.playerId ?? ''}${extra.delta ?? 1}`, itemId: 'm', at: at * M, kind, delta: 1, ...extra });

describe('průběh hry z událostí', () => {
  it('Zpět (−1) ruší poslední stejnou událost; zbytek v časovém pořadí', () => {
    const list = [ev(1, 'goal', { side: 'A' }), ev(2, 'goal', { side: 'B' }), ev(3, 'goal', { side: 'A' }), ev(4, 'goal', { side: 'A', delta: -1 })];
    expect(effectiveEvents(list).map((e) => [e.at / M, e.side])).toEqual([[1, 'A'], [2, 'B']]);
  });

  it('zápas: góly i ztráty obou stran v jednom pořadí se stavem skóre po každé události', () => {
    const list = [ev(1, 'goal', { side: 'B' }), ev(2, 'loss', { side: 'A' }), ev(3, 'goal', { side: 'A' }), ev(4, 'goal', { side: 'A' })];
    const p = matchProgress(list, 0, 5 * M);
    expect(p.steps.map((s) => [s.kind, s.side, s.score])).toEqual([
      ['goal', 'B', [0, 1]],
      ['loss', 'A', [0, 1]], // ztráta stav nemění
      ['goal', 'A', [1, 1]],
      ['goal', 'A', [2, 1]],
    ]);
    expect(p.steps[0].pos).toBeCloseTo(0.2);
    expect(p.initial).toEqual([0, 0]);
    expect(p.score).toEqual([2, 1]);
  });

  it('zápas: scénářový start – stav počítá od startu (5:5 → 6:5 …)', () => {
    const list = [ev(1, 'goal', { side: 'A' }), ev(2, 'goal', { side: 'B' }), ev(3, 'goal', { side: 'B' })];
    const p = matchProgress(list, 0, 4 * M, [5, 5]);
    expect(p.initial).toEqual([5, 5]);
    expect(p.steps.map((s) => s.score)).toEqual([[6, 5], [6, 6], [6, 7]]);
    expect(p.score).toEqual([6, 7]);
  });

  it('zápas: rozsah křivky = největší náskok, aspoň 2', () => {
    expect(matchProgress([ev(1, 'goal', { side: 'A' })], 0, 2 * M).maxLead).toBe(2);
    const comeback = ['B', 'B', 'B', 'A', 'A', 'A', 'A'].map((s, i) => ev(i + 1, 'goal', { side: s as 'A' | 'B' }));
    expect(matchProgress(comeback, 0, 8 * M).maxLead).toBe(3);
  });

  it('zápas: osa od zahájení do konce; ťuknutí mimo rozsah osu roztáhne', () => {
    const p = matchProgress([ev(1, 'goal', { side: 'A' }), ev(6, 'goal', { side: 'B' })], 2 * M, 5 * M);
    expect(p.start).toBe(1 * M);
    expect(p.end).toBe(6 * M);
    expect(p.steps.map((s) => s.pos)).toEqual([0, 1]);
  });

  it('kdo vede', () => {
    expect(leader([2, 1])).toBe('A');
    expect(leader([4, 6])).toBe('B');
    expect(leader([5, 5])).toBeNull();
  });

  it('cvičení: řada pokusů po hráči, průběžný počet povedených, nejdelší série a poloviny', () => {
    const seq = [true, true, false, true, true, true, false, true];
    const list = seq.map((ok, i) => ev(i + 1, ok ? 'hit' : 'miss', { playerId: 'p1', id: `x${i}` }));
    const d = drillTimeline(list, ['p1', 'p2']);
    expect(d.p1.marks).toEqual(seq);
    expect(d.p1.running).toEqual([1, 2, 2, 3, 4, 5, 5, 6]);
    expect(d.p1.streak).toEqual({ start: 3, length: 3 });
    expect(d.p1.halves).toEqual([3, 3]); // 1.–4.: 3, 5.–8.: 3
    expect(d.p2.marks).toEqual([]);
    expect(d.p2.running).toEqual([]);
  });

  it('cvičení: hráči se střídají po pokusu – každý má svou řadu v pořadí', () => {
    const list = [ev(1, 'hit', { playerId: 'a' }), ev(2, 'miss', { playerId: 'b' }), ev(3, 'miss', { playerId: 'a' }), ev(4, 'hit', { playerId: 'b' })];
    const d = drillTimeline(list, ['a', 'b']);
    expect(d.a.marks).toEqual([true, false]);
    expect(d.b.marks).toEqual([false, true]);
  });
});
