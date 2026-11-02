import { fairness, fairnessAdvice } from './fairness';
import { buildSchedule } from './schedule';
import type { Match, Schedule } from './types';
import { H } from '../test/fixtures';

const m = (id: string, a: string[], b: string[], block: Match['block'] = 'league'): Match =>
  ({ id, block, round: 1, table: 1, kind: a.length === 2 ? 'doubles' : 'singles', sideA: a, sideB: b }) as Match;

describe('kontrola spravedlnosti rozpisu (kdo s kým kolikrát)', () => {
  it('spolu = stejná strana, proti = opačné strany; zápasy a mimo stůl na hráče; simulace se nepočítá', () => {
    const s = {
      matches: [m('1', ['a', 'b'], ['c', 'd']), m('2', ['a', 'c'], ['b', 'd']), m('3', ['a'], ['b']), m('4', ['a', 'b'], ['c', 'd'], 'sim')],
      sections: [
        { id: 'matches', title: '', rows: [
          { time: 0, label: '1. kolo', kind: 'matches', cells: [], waiting: ['e'] },
          { time: 0, label: '2. kolo', kind: 'matches', cells: [], waiting: ['e'] },
          { time: 0, label: '3. kolo', kind: 'matches', cells: [], waiting: ['c', 'd', 'e'] },
        ] },
      ],
    } as unknown as Schedule;
    const f = fairness(s, ['a', 'b', 'c', 'd', 'e']);
    expect(f.together('a', 'b')).toBe(1);
    expect(f.against('a', 'b')).toBe(2); // 2. kolo a singl
    expect(f.against('b', 'a')).toBe(2);
    expect(f.together('a', 'c')).toBe(1);
    expect(f.against('c', 'd')).toBe(1);
    expect(f.together('c', 'd')).toBe(1);
    expect(f.games.get('a')).toBe(3);
    expect(f.games.get('e')).toBe(0);
    expect(f.sits.get('e')).toBe(3);
    expect(f.sits.get('c')).toBe(1);
  });

  it('skutečný rozpis: n=8, t=2 – každý pár se v součtu potká, rozdíly mezi hráči malé', () => {
    const s = buildSchedule({ mode: 'team', tables: 2, attendees: H(8), format: 'custom', plan: { normal: 4, lossTax: 2, wall: 2 }, lockedRounds: [] });
    const f = fairness(s, H(8));
    const games = H(8).map((p) => f.games.get(p)!);
    expect(Math.max(...games) - Math.min(...games)).toBeLessThanOrEqual(1);
    expect(f.maxTogether).toBeGreaterThan(0);
  });
});

describe('nápověda: kolik kol přidat, aby hrál každý s každým', () => {
  const base = { mode: 'team' as const, format: 'custom' as const, lockedRounds: [], breaks: [], simSplit: 'order' as const, scores: {} };

  it('6 hráčů: kolik kol daného zápasu chybí na spoluhráče i soupeře; s nimi jsou pokryté všechny dvojice', () => {
    const t = { ...base, tables: 4 as const, attendees: H(6), plan: { normal: 1, wall: 2, start03: 2 } };
    const a = fairnessAdvice(t);
    expect(a.discipline).toBe('normal');
    expect(a.neverWith).toBeGreaterThan(0);
    expect(a.addForWith).toBeGreaterThan(0);
    const f = fairness(buildSchedule({ ...t, plan: { ...t.plan, normal: 1 + a.addForWith! } }), H(6));
    for (const x of H(6)) for (const y of H(6)) if (x !== y) expect(f.together(x, y)).toBeGreaterThan(0);
    // o kolo míň už nestačí
    const g = fairness(buildSchedule({ ...t, plan: { ...t.plan, normal: a.addForWith! } }), H(6));
    expect(H(6).some((x) => H(6).some((y) => x !== y && g.together(x, y) === 0))).toBe(true);
    expect(a.addForAgainst).not.toBeNull();
  });

  it('už teď pokryté → 0; bez dvojic (pod 4 hráče) spolu hrát nejde', () => {
    const many = { ...base, tables: 4 as const, attendees: H(4), plan: { normal: 6 } };
    expect(fairnessAdvice(many)).toMatchObject({ neverWith: 0, neverAgainst: 0, addForWith: 0, addForAgainst: 0 });
    const three = fairnessAdvice({ ...base, tables: 2 as const, attendees: H(3), plan: { normal: 2 } });
    expect(three.doubles).toBe(false);
    expect(three.addForWith).toBeNull();
  });

  it('přidává kola vybrané nepárové disciplíny dvojic (ne Zeď, ne Jedničky); žádná vybraná → Normální leg', () => {
    expect(fairnessAdvice({ ...base, tables: 4 as const, attendees: H(8), plan: { wall: 2, lossTax: 1, singles: 1 } }).discipline).toBe('lossTax');
    expect(fairnessAdvice({ ...base, tables: 4 as const, attendees: H(8), plan: { wall: 2 } }).discipline).toBe('normal');
  });

  it('když to nejde ani s mnoha koly navíc, vrátí null (hráčů je na to moc)', () => {
    const a = fairnessAdvice({ ...base, tables: 1 as const, attendees: H(13), plan: { normal: 1 } }, 5);
    expect(a.addForWith).toBeNull();
  });
});
