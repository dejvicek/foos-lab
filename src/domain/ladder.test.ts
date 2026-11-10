import { computeLadder, playerHistory, resolveRange } from './ladder';
import { addDays } from './dates';
import { scoreFor, training } from '../test/fixtures';

const TODAY = '2026-10-31';

// X: 3 tréninky – (7 legů, +6, 4 výhry), (3 legy, +2, 2 výhry) a (2 legy, −3, 0 výher). Y: 1 trénink (7 legů, +10).
const t1 = scoreFor(training('t1', '2026-10-20', 'team', ['X', 'P2', 'P3', 'P4']), 'X', [
  [6, 1], [6, 3], [6, 4], [6, 5], [3, 6], [5, 6], [5, 6],
]);
const t2 = scoreFor(training('t2', '2026-10-25', 'single', ['X', 'Q2', 'Q3', 'Q4'], 2), 'X', [
  [6, 4], [6, 5], [5, 6],
]);
const t2b = scoreFor(training('t2b', '2026-10-27', 'single', ['X', 'Q2', 'Q3', 'Q4'], 2), 'X', [
  [5, 6], [4, 6],
]);
const t3 = scoreFor(training('t3', '2026-10-28', 'team', ['Y', 'R2', 'R3', 'R4']), 'Y', [
  [6, 0], [6, 1], [6, 4], [4, 6], [5, 6], [5, 6], [6, 5],
]);
const all = [t1, t2, t2b, t3];
const find = (rows: { playerId: string }[], id: string) => rows.findIndex((r) => r.playerId === id);

describe('dates', () => {
  it('addDays přes hranici měsíce', () => {
    expect(addDays('2026-10-31', -27)).toBe('2026-10-04');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('resolveRange', () => {
  it('forma = posledních 28 dní včetně dneška', () => {
    expect(resolveRange({ kind: 'form' }, TODAY)).toEqual({ from: '2026-10-04', to: '2026-10-31' });
  });
  it('celkově bez mezí', () => {
    expect(resolveRange({ kind: 'all' }, TODAY)).toEqual({ from: null, to: null });
  });
  it('vlastní období s prohozenými mezemi se prohodí', () => {
    expect(resolveRange({ kind: 'custom', from: '2026-10-20', to: '2026-10-01' }, TODAY)).toEqual({
      from: '2026-10-01',
      to: '2026-10-20',
    });
  });
});

describe('computeLadder', () => {
  it('Celkem: součty a řazení podle rozdílu (Y nad X)', () => {
    const { ranked, lowData } = computeLadder(all, { kind: 'all' }, 'total', TODAY);
    expect(lowData).toEqual([]);
    const x = ranked[find(ranked, 'X')];
    expect(x).toMatchObject({ trainings: 3, legs: 12, diff: 5, wins: 6 });
    expect(find(ranked, 'Y')).toBeLessThan(find(ranked, 'X'));
  });

  it('Průměr: rozdíl/leg a % výher; hráč s 1 tréninkem je „málo dat“', () => {
    const { ranked, lowData } = computeLadder(all, { kind: 'all' }, 'avg', TODAY);
    const x = ranked[find(ranked, 'X')];
    expect(x.diffPerLeg).toBeCloseTo(5 / 12);
    expect(x.winRate).toBe(0.5);
    expect(x.lossPerLeg).toBeNull();
    expect(find(ranked, 'Y')).toBe(-1);
    expect(find(lowData, 'Y')).toBeGreaterThanOrEqual(0);
  });

  it('pro pořadí v Průměru jsou potřeba aspoň 3 tréninky (2 nestačí)', () => {
    const two = computeLadder([t1, t2, t3], { kind: 'all' }, 'avg', TODAY);
    expect(find(two.ranked, 'X')).toBe(-1);
    expect(two.lowData[find(two.lowData, 'X')]).toMatchObject({ trainings: 2 });
    const three = computeLadder(all, { kind: 'all' }, 'avg', TODAY);
    expect(three.ranked[find(three.ranked, 'X')]).toMatchObject({ trainings: 3 });
  });

  it('forma: trénink 2026-10-03 se nezapočte, 2026-10-04 ano', () => {
    const before = scoreFor(training('a', '2026-10-03', 'single', ['Z', 'Z2', 'Z3', 'Z4'], 2), 'Z', [[6, 0]]);
    const edge = scoreFor(training('b', '2026-10-04', 'single', ['Z', 'Z2', 'Z3', 'Z4'], 2), 'Z', [[6, 1]]);
    const { ranked } = computeLadder([before, edge], { kind: 'form' }, 'total', TODAY);
    expect(ranked[find(ranked, 'Z')]).toMatchObject({ trainings: 1, legs: 1, diff: 5 });
  });

  it('vlastní období s prohozenými mezemi dává stejný výsledek', () => {
    const a = computeLadder(all, { kind: 'custom', from: '2026-10-01', to: '2026-10-26' }, 'total', TODAY);
    const b = computeLadder(all, { kind: 'custom', from: '2026-10-26', to: '2026-10-01' }, 'total', TODAY);
    expect(b).toEqual(a);
    expect(find(a.ranked, 'Y')).toBe(-1); // t3 je mimo období
  });

  it('přítomný hráč bez zapsaného legu se nezobrazí', () => {
    const t = training('e', '2026-10-30', 'team', ['W1', 'W2', 'W3', 'W4']);
    const res = computeLadder([...all, t], { kind: 'all' }, 'total', TODAY);
    expect(find([...res.ranked, ...res.lowData], 'W1')).toBe(-1);
  });

  it('tréninky mimo 4–13 hráčů se přeskočí', () => {
    const bad = training('bad', '2026-10-30', 'team', ['X', 'Y']);
    expect(() => computeLadder([...all, bad], { kind: 'all' }, 'total', TODAY)).not.toThrow();
  });

  it('Průměr řadí podle rozdílu/leg', () => {
    // tři tréninky pro Y, aby byl v ranked: Y má +10/7 + 0 + 0 → stále nad X (+5/12)
    const t4s = scoreFor(training('t4', '2026-10-29', 'team', ['Y', 'R2', 'R3', 'R4']), 'Y', [[6, 6]]);
    const t5s = scoreFor(training('t5', '2026-10-30', 'team', ['Y', 'R2', 'R3', 'R4']), 'Y', [[6, 6]]);
    const { ranked } = computeLadder([...all, t4s, t5s], { kind: 'all' }, 'avg', TODAY);
    expect(find(ranked, 'Y')).toBeLessThan(find(ranked, 'X'));
  });
});

describe('playerHistory', () => {
  it('tréninky hráče v období, nejnovější první', () => {
    const h = playerHistory(all, 'X', { kind: 'all' }, TODAY);
    expect(h.map((r) => r.trainingId)).toEqual(['t2b', 't2', 't1']);
    expect(h[2]).toMatchObject({ date: '2026-10-20', mode: 'team', legs: 7, wins: 4, diff: 6 });
  });
});
