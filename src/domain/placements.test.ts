import { gapsOf, placementsOf } from './placements';
import { scoreFor, training } from '../test/fixtures';

const TODAY = '2026-10-31';

describe('gapsOf – odstup na sousední místa (20. 11. 2026)', () => {
  const rows = [
    { playerId: 'A', v: 2.4 },
    { playerId: 'B', v: 0.5 },
    { playerId: 'C', v: 0.4 },
    { playerId: 'D', v: 0.4 },
  ];
  it('uprostřed: kolik chybí na hráče přede mnou a náskok před tím za mnou', () => {
    const g = gapsOf(rows, 'B', (r) => r.v)!;
    expect(g).toMatchObject({ place: 2, of: 4, ahead: { playerId: 'A', place: 1 }, behind: { playerId: 'C', place: 3 } });
    expect(g.ahead!.gap).toBeCloseTo(1.9);
    expect(g.behind!.gap).toBeCloseTo(0.1);
  });
  it('první nemá nikoho před sebou, poslední za sebou; shoda = 0', () => {
    expect(gapsOf(rows, 'A', (r) => r.v)!.ahead).toBeUndefined();
    const d = gapsOf(rows, 'D', (r) => r.v)!;
    expect(d).toMatchObject({ place: 4, ahead: { playerId: 'C', gap: 0 } });
    expect(d.behind).toBeUndefined();
    expect(gapsOf(rows, 'Z', (r) => r.v)).toBeNull();
  });
});

describe('placementsOf – kde jsem ve všech žebříčcích (20. 11. 2026)', () => {
  const day = (id: string, date: string, who: string, s: [number, number][]) => scoreFor(training(id, date, 'single', [who, `${who}2`, `${who}3`, `${who}4`], 2), who, s);
  const ts = [
    day('a1', '2026-10-10', 'A', [[6, 0]]), day('a2', '2026-10-11', 'A', [[6, 0]]), day('a3', '2026-10-12', 'A', [[6, 0]]),
    day('b1', '2026-10-10', 'B', [[6, 2]]), day('b2', '2026-10-11', 'B', [[6, 2]]),
  ];
  it('hlavní žebříček: místo z kolika; pod čarou bez místa s počtem tréninků', () => {
    const a = placementsOf(ts, 'A', { kind: 'all' }, 'avg', TODAY).find((p) => p.ref.kind === 'main')!;
    expect(a.place).toBe(1);
    expect(a.of).toBeGreaterThanOrEqual(1);
    const b = placementsOf(ts, 'B', { kind: 'all' }, 'avg', TODAY).find((p) => p.ref.kind === 'main')!;
    expect(b).toMatchObject({ place: null, trainings: 2 });
  });
  it('i zápasy podle disciplín (Jedničky = 1v1)', () => {
    expect(placementsOf(ts, 'A', { kind: 'all' }, 'avg', TODAY).some((p) => p.ref.kind === 'match' && p.ref.discipline === 'singles')).toBe(true);
  });
  it('hráč bez zápasů v období nikde', () => {
    expect(placementsOf(ts, 'Z', { kind: 'all' }, 'avg', TODAY)).toEqual([]);
  });
});
