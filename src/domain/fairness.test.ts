import { fairness } from './fairness';
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
