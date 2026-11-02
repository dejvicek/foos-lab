import { buildSchedule } from './schedule';
import type { Match, Mode, TableCount } from './types';
import { H } from '../test/fixtures';

const league = (n: number, t: TableCount, mode: Mode = 'team') =>
  buildSchedule({ mode, tables: t, attendees: H(n) }).matches.filter((m) => m.block === 'league');
const round = (ms: Match[], r: number) => ms.filter((m) => m.round === r);

describe('pravidla kol na zápasech', () => {
  it('Zeď: kolo 3 hraje levá strana (A), kolo 4 pravá (B)', () => {
    const ms = league(8, 4);
    expect(round(ms, 3).every((m) => m.wall === 'A')).toBe(true);
    expect(round(ms, 4).every((m) => m.wall === 'B')).toBe(true);
    expect(round(ms, 1).every((m) => m.wall === undefined)).toBe(true);
  });

  it('scénářové starty: kolo 5 0:3, kolo 6 4:4, kolo 7 5:5', () => {
    const ms = league(8, 4);
    expect(round(ms, 5)[0].start).toEqual([0, 3]);
    expect(round(ms, 6)[0].start).toEqual([4, 4]);
    expect(round(ms, 7)[0].start).toEqual([5, 5]);
    expect(round(ms, 1)[0].start).toBeUndefined();
  });

  it('Daň: kola 2 a 5', () => {
    const ms = league(8, 4);
    expect([...new Set(ms.filter((m) => m.lossTax).map((m) => m.round))]).toEqual([2, 5]);
  });

  it('rozhodčí: čekající popořadě ke stolům 1, 2…; ztráty se zapisují u každého stolu, i v Dani', () => {
    const ms = league(13, 4); // kolo 1 čeká H13, kolo 2 H1
    const r1 = round(ms, 1);
    expect(r1.map((m) => m.referee)).toEqual(['H13', undefined, undefined]);
    expect(r1.map((m) => m.trackLosses)).toEqual([true, true, true]);
    expect(round(ms, 2).map((m) => m.trackLosses)).toEqual([true, true, true]); // Daň
    expect(round(ms, 2)[0].referee).toBe('H1');
  });

  it('nikdo nečeká → ztráty se zapisují stejně (hráči si je počítají sami)', () => {
    expect(league(8, 4).every((m) => m.trackLosses)).toBe(true);
  });

  it('jedničky n=5, t=2: počítá H5 u stolu 1, ztráty u obou stolů', () => {
    const r1 = round(league(5, 2, 'single'), 1);
    expect(r1.map((m) => [m.referee, m.trackLosses])).toEqual([['H5', true], [undefined, true]]);
  });

  it('simulace nemá ztráty ani rozhodčí', () => {
    const sim = buildSchedule({ mode: 'team', tables: 4, attendees: H(13) }).matches.filter((m) => m.block === 'sim');
    expect(sim.every((m) => !m.trackLosses && m.referee === undefined)).toBe(true);
  });
});
