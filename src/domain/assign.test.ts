import { assign } from './assign';
import { rotate } from './rotation';
import { H, range } from '../test/fixtures';

const shape = (r: ReturnType<typeof assign>) => r.tables.map((t) => [t.kind, t.a, t.b]);

describe('assign', () => {
  it('n=8, t=4: 2 dvojice, nikdo nečeká', () => {
    const r = assign(H(8), 4, false);
    expect(shape(r)).toEqual([
      ['doubles', ['H1', 'H2'], ['H3', 'H4']],
      ['doubles', ['H5', 'H6'], ['H7', 'H8']],
    ]);
    expect(r.waiting).toEqual([]);
  });

  it('n=13, t=4: čeká H13, po rotaci o 1 čeká H1', () => {
    expect(assign(H(13), 4, false).tables.length).toBe(3);
    expect(assign(H(13), 4, false).waiting).toEqual(['H13']);
    expect(assign(rotate(H(13), 1), 4, false).waiting).toEqual(['H1']);
  });

  it('n=7, t=4: 1 dvojice + 1 singl + 1 rozhodčí', () => {
    const r = assign(H(7), 4, false);
    expect(r.tables.map((t) => t.kind)).toEqual(['doubles', 'singles']);
    expect(r.waiting).toEqual(['H7']);
  });

  it('n=5, t=2, jen singly: 2 singly + 1 počítá', () => {
    const r = assign(H(5), 2, true);
    expect(r.tables.map((t) => t.kind)).toEqual(['singles', 'singles']);
    expect(r.waiting).toEqual(['H5']);
  });

  it('invariant: n=4..13, t=1..4 – nejvýš t stolů, každý hráč přesně jednou', () => {
    for (const n of range(4, 13))
      for (const t of range(1, 4))
        for (const singlesOnly of [true, false]) {
          const r = assign(H(n), t, singlesOnly);
          expect(r.tables.length).toBeLessThanOrEqual(t);
          const seen = [...r.tables.flatMap((m) => [...m.a, ...m.b]), ...r.waiting];
          expect([...seen].sort()).toEqual([...H(n)].sort());
          if (singlesOnly) expect(r.tables.every((m) => m.kind === 'singles')).toBe(true);
        }
  });
});
