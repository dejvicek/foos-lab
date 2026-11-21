import { before, lastDay, rankMoves } from './moves';
import { computeLadder } from './ladder';
import { isClub } from './practice';
import { scoreFor, training } from '../test/fixtures';

const TODAY = '2026-10-31';
const scored = (t: { scores: Record<string, unknown> }) => Object.keys(t.scores).length > 0;

describe('rankMoves – posun v pořadí od posledního tréninku', () => {
  it('nahoru kladně, dolů záporně, beze změny 0, nově nad čarou „new“', () => {
    const m = rankMoves(['A', 'B', 'C'], ['B', 'A', 'D', 'C']);
    expect(m.get('B')).toBe(1);
    expect(m.get('A')).toBe(-1);
    expect(m.get('D')).toBe('new');
    expect(m.get('C')).toBe(-1);
  });
  it('bez předchozího stavu (null) žádný posun', () => {
    expect(rankMoves(null, ['A']).size).toBe(0);
  });
});

describe('lastDay / before', () => {
  const t1 = scoreFor(training('t1', '2026-10-20', 'team', ['X', 'P2', 'P3', 'P4']), 'X', [[6, 1]]);
  const t2 = scoreFor(training('t2', '2026-10-25', 'team', ['X', 'P2', 'P3', 'P4']), 'X', [[6, 4]]);
  // Založený, ale ještě nehraný trénink posun nemaže.
  const empty = training('t3', '2026-10-30', 'team', ['X', 'P2', 'P3', 'P4']);
  const old = scoreFor(training('t0', '2026-09-01', 'team', ['X', 'P2', 'P3', 'P4']), 'X', [[6, 1]]);

  it('poslední den v období, kdy se něco zapsalo', () => {
    const counts = (t: typeof t1) => isClub(t) && scored(t);
    expect(lastDay([t1, t2, empty], { kind: 'all' }, TODAY, counts)).toBe('2026-10-25');
    expect(lastDay([old], { kind: 'form' }, TODAY, counts)).toBeNull();
    expect(lastDay([t1, t2], { kind: 'custom', from: '2026-10-01', to: '2026-10-22' }, TODAY, counts)).toBe('2026-10-20');
  });

  it('stav před posledním dnem = tréninky s dřívějším datem', () => {
    expect(before([t1, t2, empty], '2026-10-25').map((t) => t.id)).toEqual(['t1']);
  });

  it('žebříček před posledním tréninkem a po něm', () => {
    // A, B, C mají po 3 trénincích; poslední trénink A propadne, C se posune nahoru.
    const day = (id: string, date: string, who: string, s: [number, number][]) =>
      scoreFor(training(id, date, 'single', [who, `${who}2`, `${who}3`, `${who}4`], 2), who, s);
    const ts = [
      day('a1', '2026-10-10', 'A', [[6, 0]]), day('a2', '2026-10-11', 'A', [[6, 0]]), day('a3', '2026-10-12', 'A', [[6, 0]]),
      day('b1', '2026-10-10', 'B', [[6, 2]]), day('b2', '2026-10-11', 'B', [[6, 2]]), day('b3', '2026-10-12', 'B', [[6, 2]]),
      day('c1', '2026-10-10', 'C', [[6, 4]]), day('c2', '2026-10-11', 'C', [[6, 4]]), day('c3', '2026-10-12', 'C', [[6, 4]]),
      day('a4', '2026-10-20', 'A', [[0, 6], [0, 6], [0, 6], [0, 6]]),
    ];
    const ids = (rows: { playerId: string }[]) => rows.map((r) => r.playerId).filter((p) => ['A', 'B', 'C'].includes(p));
    const d = lastDay(ts, { kind: 'all' }, TODAY, scored)!;
    const prev = computeLadder(before(ts, d), { kind: 'all' }, 'avg', TODAY).ranked;
    const cur = computeLadder(ts, { kind: 'all' }, 'avg', TODAY).ranked;
    expect(ids(prev)).toEqual(['A', 'B', 'C']);
    expect(ids(cur)).toEqual(['B', 'C', 'A']);
    const m = rankMoves(ids(prev), ids(cur));
    expect(m.get('B')).toBeGreaterThan(0);
    expect(m.get('A')).toBeLessThan(0);
  });
});
