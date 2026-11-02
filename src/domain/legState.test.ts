import { bump, legOver, tableScore } from './legState';
import type { Match } from './types';

const m = (over: Partial<Match> = {}): Match => ({
  id: 'x', block: 'league', round: 1, table: 1, kind: 'doubles', sideA: ['a', 'b'], sideB: ['c', 'd'], ...over,
});

describe('stav legu', () => {
  it('normální leg do 6', () => {
    expect(legOver(m(), { ga: 5, gb: 4 })).toEqual({ over: false, winner: null });
    expect(legOver(m(), { ga: 6, gb: 4 })).toEqual({ over: true, winner: 'A' });
  });

  it('start 0:3: stav na stole = start + odehrané, konec při 6 na stole', () => {
    const s = m({ start: [0, 3] });
    expect(tableScore(s, { ga: 2, gb: 1 })).toEqual([2, 4]);
    expect(legOver(s, { ga: 2, gb: 3 })).toEqual({ over: true, winner: 'B' });
  });

  it('start 5:5: o 2 góly, strop 10', () => {
    const s = m({ start: [5, 5] });
    expect(legOver(s, { ga: 1, gb: 0 }).over).toBe(false); // 6:5
    expect(legOver(s, { ga: 2, gb: 0 })).toEqual({ over: true, winner: 'A' }); // 7:5
    expect(legOver(s, { ga: 4, gb: 3 }).over).toBe(false); // 9:8
    expect(legOver(s, { ga: 5, gb: 4 })).toEqual({ over: true, winner: 'A' }); // 10:9 strop
  });

  it('simulace: do 2 setů', () => {
    expect(legOver(m({ block: 'sim' }), { ga: 1, gb: 1 }).over).toBe(false);
    expect(legOver(m({ block: 'sim' }), { ga: 1, gb: 2 })).toEqual({ over: true, winner: 'B' });
  });

  it('bump: přičte, nejde pod 0 ani přes strop, nedotčená pole zůstanou', () => {
    expect(bump(m(), {}, 'ga', 1)).toEqual({ ga: 1 });
    expect(bump(m(), { ga: 1, la: 2 }, 'ga', -1)).toEqual({ ga: 0, la: 2 });
    expect(bump(m(), { ga: 0 }, 'ga', -1)).toEqual({ ga: 0 });
    expect(bump(m({ start: [5, 5] }), { ga: 5 }, 'ga', 1)).toEqual({ ga: 5 }); // 10 na stole je strop
    expect(bump(m({ block: 'sim' }), { gb: 2 }, 'gb', 1)).toEqual({ gb: 2 });
    expect(bump(m(), { la: 30 }, 'la', 1)).toEqual({ la: 30 });
  });
});
