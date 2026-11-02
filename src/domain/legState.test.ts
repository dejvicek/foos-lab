import { bump, bumpLimit, legOver, MAX_LOSSES, maxLosses, setLosses, tableScore, taxGoal, winnerFor } from './legState';
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

  it('bump: přičte, nejde pod 0 ani přes strop; druhá strana dostane 0, aby se leg započítal', () => {
    expect(bump(m(), {}, 'ga', 1)).toEqual({ ga: 1, gb: 0 });
    expect(bump(m(), { ga: 1, gb: 0, la: 2 }, 'ga', -1)).toEqual({ ga: 0, gb: 0, la: 2 });
    expect(bump(m(), { ga: 0 }, 'ga', -1)).toEqual({ ga: 0, gb: 0 });
    expect(bump(m({ start: [5, 5] }), { ga: 5, gb: 3 }, 'ga', 1)).toEqual({ ga: 5, gb: 3 }); // 10 na stole je strop
    expect(bump(m({ block: 'sim' }), { gb: 2 }, 'gb', 1)).toEqual({ ga: 0, gb: 2 });
    expect(bump(m(), { la: 30 }, 'la', 1)).toEqual({ la: 30, lb: 0 });
    expect(bump(m(), { ga: 2, gb: 1 }, 'lb', 1)).toEqual({ ga: 2, gb: 1, la: 0, lb: 1 });
  });

  it('strop ťukání: běžný leg do 6 na stole (dva telefony neudělají 7:4), 5:5 do 10, simulace 2 sety', () => {
    expect(bumpLimit(m(), 'ga')).toBe(6);
    expect(bumpLimit(m({ start: [0, 3] }), 'gb')).toBe(3);
    expect(bumpLimit(m({ start: [4, 4] }), 'ga')).toBe(2);
    expect(bumpLimit(m({ start: [5, 5] }), 'ga')).toBe(5);
    expect(bumpLimit(m({ block: 'sim' }), 'gb')).toBe(2);
    expect(bumpLimit(m(), 'la')).toBe(30);
    expect(bump(m(), { ga: 6, gb: 4 }, 'ga', 1)).toEqual({ ga: 6, gb: 4 });
  });

  it('předvyplnění vítěze: soupeři chybějícímu skóre doplní vítězný stav na stole', () => {
    expect([0, 3, 5].map((v) => winnerFor(m(), v))).toEqual([6, 6, 6]);
    expect(winnerFor(m(), 6)).toBeNull(); // 6 je vítěz – poraženého neznáme
    expect(winnerFor(m({ start: [0, 3] }), 2)).toBe(6);
    expect(winnerFor(m({ start: [4, 4] }), 5)).toBe(6);
    // 5:5 o 2 góly, strop 10
    expect([5, 6, 7, 8, 9].map((v) => winnerFor(m({ start: [5, 5] }), v))).toEqual([7, 8, 9, 10, 10]);
    expect(winnerFor(m({ start: [5, 5] }), 10)).toBeNull();
    // simulace: 2 sety
    expect(winnerFor(m({ block: 'sim' }), 1)).toBe(2);
    expect(winnerFor(m({ block: 'sim' }), 2)).toBeNull();
  });
});

describe('Daň za ztrátu: ztráta je hned gól soupeře', () => {
  const tax = { id: 'x', block: 'league', sideA: ['a'], sideB: ['b'], lossTax: true, trackLosses: true } as unknown as Match;
  const plain = { ...tax, lossTax: false } as Match;
  const start03 = { ...tax, start: [0, 3] } as Match;

  it('ztráta strany zvedne góly soupeře; gól ani běžná disciplína nic dalšího', () => {
    expect(taxGoal(tax, 'la')).toBe('gb');
    expect(taxGoal(tax, 'lb')).toBe('ga');
    expect(taxGoal(tax, 'ga')).toBeNull();
    expect(taxGoal(plain, 'la')).toBeNull();
  });

  it('ztrát může být nejvýš tolik, kolik soupeři zbývá gólů do konce legu (jeho góly ze ztrát se nepočítají)', () => {
    expect(maxLosses(tax, { ga: 0, gb: 0 }, 'la')).toBe(6);
    expect(maxLosses(tax, {}, 'la')).toBe(6);
    expect(maxLosses(tax, { ga: 0, gb: 2, la: 0 }, 'la')).toBe(4); // 2 góly soupeře „ze hry“
    expect(maxLosses(tax, { ga: 0, gb: 2, la: 2 }, 'la')).toBe(6); // oba góly jsou z mých ztrát
    expect(maxLosses(tax, { ga: 6, gb: 2 }, 'lb')).toBe(0);
    expect(maxLosses(start03, {}, 'la')).toBe(3); // pravá začíná na 3, do 6 jí chybí 3 góly
    expect(maxLosses(plain, { ga: 6, gb: 2 }, 'la')).toBe(MAX_LOSSES);
  });

  it('zápis počtu ztrát (notebook) mění i góly soupeře o stejný rozdíl', () => {
    expect(setLosses(tax, { ga: 0, gb: 0 }, 'la', 2)).toEqual({ ga: 0, gb: 2, la: 2, lb: 0 });
    expect(setLosses(tax, { ga: 1, gb: 3, la: 2, lb: 0 }, 'la', 1)).toEqual({ ga: 1, gb: 2, la: 1, lb: 0 });
    expect(setLosses(tax, {}, 'lb', 9)).toEqual({ ga: 6, gb: 0, la: 0, lb: 6 }); // strop
    expect(setLosses(plain, { ga: 0, gb: 0 }, 'la', 2)).toEqual({ ga: 0, gb: 0, la: 2, lb: 0 });
  });
});
