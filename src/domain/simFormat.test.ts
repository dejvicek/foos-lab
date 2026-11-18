import { buildSchedule } from './schedule';
import { cleanFormats, formatLabel, formatMins, formatOf, legId, matchState, normalizeFormat, SIM_FORMATS } from './matchFormat';
import { bumpLimit, legOver, setScores, winnerFor } from './legState';
import { computeStandings } from './standings';
import { legOf } from './matchFormat';
import { lockThrough } from './customSchedule';
import type { LockedRound, Match, Score, TableCount, Training } from './types';
import { H } from '../test/fixtures';

/**
 * Simulace ligového kola v legech (18. 11. 2026, *rozhodnutí uživatele*): zápas simulace se zapisuje po
 * legech jako ostatní BO zápasy. Formát týmové simulace: BO3 do 6, rozhodující leg o 2 se stropem 10
 * (výchozí), nebo BO5 do 5, rozhodující leg o 2 se stropem 10. Starší simulace (zamčená kola bez
 * formátu, klasický trénink) zůstávají v setech.
 */
const custom = (n: number, tables: TableCount, over: Partial<Training> = {}): Training => ({
  id: 'c',
  date: '2026-11-18',
  startTime: '18:00',
  mode: 'team',
  tables,
  attendees: H(n),
  scores: {},
  soloResults: {},
  simSplit: 'order',
  simTeams: null,
  format: 'custom',
  durationMin: 120,
  plan: { normal: 1, sim: 1 },
  lockedRounds: [],
  breaks: [],
  ...over,
});
const simMatches = (t: Training) => buildSchedule(t).matches.filter((m) => m.block === 'sim');
const BO5 = { bestOf: 5, legTo: 5, finalWinBy2: true, cap: 10 };

describe('formát simulace', () => {
  it('dvě možnosti: BO3 do 6 a BO5 do 5, rozhodující leg o 2 se stropem 10', () => {
    expect(SIM_FORMATS).toEqual([{ bestOf: 3, legTo: 6, finalWinBy2: true, cap: 10 }, BO5]);
  });

  it('výchozí BO3 do 6; cokoli jiného než BO5 → BO3, pravidla legů se nastavit nedají', () => {
    expect(formatOf(null, 'sim')).toEqual(SIM_FORMATS[0]);
    expect(normalizeFormat('sim', { bestOf: 5, legTo: 9, cap: 15 })).toEqual(BO5);
    expect(normalizeFormat('sim', { bestOf: 1, legTo: 6 })).toEqual(SIM_FORMATS[0]);
    expect(normalizeFormat('sim', { bestOf: 2, legTo: 6 })).toEqual(SIM_FORMATS[0]);
  });

  it('ukládá se jen BO5 (BO3 je výchozí)', () => {
    expect(cleanFormats({ sim: SIM_FORMATS[0] })).toBeUndefined();
    expect(cleanFormats({ sim: { bestOf: 5, legTo: 6 } })).toEqual({ sim: BO5 });
  });

  it('popisek a délka kola: délka simulace se s formátem nemění', () => {
    expect(formatLabel(SIM_FORMATS[0])).toBe('BO3 do 6 rozhodující leg o 2 (strop 10)');
    expect(formatLabel(BO5)).toBe('BO5 do 5 rozhodující leg o 2 (strop 10)');
    expect(formatMins({ sim: 40 }, { sim: BO5 })).toEqual({ sim: 40 });
  });
});

describe('simulace v rozpisu konfigurovatelného tréninku', () => {
  it('pro n = 4..13 a stoly 2..4 nese každý zápas simulace formát (výchozí BO3 do 6)', () => {
    for (let n = 4; n <= 13; n++)
      for (const tables of [2, 3, 4] as TableCount[]) {
        const ms = simMatches(custom(n, tables));
        expect(ms.length).toBeGreaterThan(0);
        for (const m of ms) expect(m).toMatchObject({ bestOf: 3, legTo: 6, finalWinBy2: true, cap: 10 });
      }
  });

  it('BO5 do 5 z nastavení tréninku; sestavy a časy vln se nemění', () => {
    const bo3 = buildSchedule(custom(8, 4));
    const bo5 = buildSchedule(custom(8, 4, { matchFormats: { sim: BO5 } }));
    for (const m of bo5.matches.filter((x) => x.block === 'sim')) expect(m).toMatchObject({ bestOf: 5, legTo: 5, finalWinBy2: true, cap: 10 });
    const waves = (s: typeof bo3) => s.sections.find((x) => x.id === 'sim')!.rows.map((r) => ({ time: r.time, ids: r.cells.map((c) => (c?.type === 'match' ? c.match.id : null)) }));
    expect(waves(bo5)).toEqual(waves(bo3));
    expect(bo5.sections.find((x) => x.id === 'sim')!.rows[0].rule).toBe('20 min, BO5 do 5 rozhodující leg o 2 (strop 10)');
  });

  it('zamčená simulace bez formátu (zahájená před změnou) zůstává v setech', () => {
    const t = custom(8, 4);
    const s = buildSchedule(t);
    const strip = ({ bestOf: _b, legTo: _l, finalWinBy2: _f, cap: _c, ...m }: Match) => m as Match;
    const lockedRounds: LockedRound[] = lockThrough(s, [], 2).map((l) => ({
      ...l,
      rows: l.rows.map((r) => ({ ...r, cells: r.cells.map((c) => (c?.type === 'match' && c.match.block === 'sim' ? { ...c, match: strip(c.match) } : c)) })),
    }));
    expect(lockedRounds.map((l) => l.discipline)).toEqual(['normal', 'sim']);
    const old = simMatches({ ...t, lockedRounds });
    expect(old.length).toBeGreaterThan(0);
    for (const m of old) expect(m.bestOf).toBeUndefined();
    expect(legOver(old[0], { ga: 2, gb: 1 })).toEqual({ over: true, winner: 'A' });
  });

  it('klasický trénink: simulace v setech jako dřív', () => {
    const s = buildSchedule({ mode: 'team', tables: 4, attendees: H(8) });
    for (const m of s.matches.filter((x) => x.block === 'sim')) expect(m.bestOf).toBeUndefined();
  });
});

describe('zápis legů simulace', () => {
  const [bo3] = simMatches(custom(8, 4));
  const [bo5] = simMatches(custom(8, 4, { matchFormats: { sim: BO5 } }));

  it('leg do 6 (BO5 do 5), rozhodující leg o 2 se stropem 10', () => {
    expect(legOver(legOf(bo3, 1), { ga: 6, gb: 4 })).toEqual({ over: true, winner: 'A' });
    expect(legOver(legOf(bo3, 1), { ga: 2, gb: 1 }).over).toBe(false);
    expect(legOver(legOf(bo3, 3), { ga: 6, gb: 5 }).over).toBe(false);
    expect(legOver(legOf(bo3, 3), { ga: 10, gb: 9 })).toEqual({ over: true, winner: 'A' });
    expect(legOver(legOf(bo5, 1), { ga: 5, gb: 3 })).toEqual({ over: true, winner: 'A' });
    expect(legOver(legOf(bo5, 5), { ga: 5, gb: 4 }).over).toBe(false);
    expect(legOver(legOf(bo5, 5), { ga: 7, gb: 5 })).toEqual({ over: true, winner: 'A' });
  });

  it('strop ťukání a předvyplnění vítěze jako u zápasu', () => {
    expect(bumpLimit(legOf(bo3, 1), 'ga')).toBe(6);
    expect(bumpLimit(legOf(bo3, 3), 'ga')).toBe(10);
    expect(bumpLimit(legOf(bo5, 1), 'gb')).toBe(5);
    expect(winnerFor(legOf(bo3, 1), 3)).toBe(6);
    expect(winnerFor(legOf(bo5, 5), 7)).toBe(9);
  });

  it('starší zápas simulace bez formátu se zapisuje v setech', () => {
    const old: Match = { ...bo3, bestOf: undefined, legTo: undefined, finalWinBy2: undefined, cap: undefined };
    expect(setScores(old)).toBe(true);
    expect(setScores(bo3)).toBe(false);
    expect(setScores(legOf(bo3, 2))).toBe(false);
    expect(bumpLimit(old, 'ga')).toBe(2);
  });

  it('zápas rozhodnutý po legech: BO3 2:1, BO5 3:0', () => {
    const sc: Record<string, Score> = { [bo3.id]: { ga: 6, gb: 4 }, [legId(bo3.id, 2)]: { ga: 3, gb: 6 }, [legId(bo3.id, 3)]: { ga: 10, gb: 8 } };
    expect(matchState(bo3, sc)).toMatchObject({ over: true, winner: 'A', legsA: 2, legsB: 1 });
    const sc5: Record<string, Score> = { [bo5.id]: { ga: 1, gb: 5 }, [legId(bo5.id, 2)]: { ga: 2, gb: 5 }, [legId(bo5.id, 3)]: { ga: 4, gb: 5 } };
    expect(matchState(bo5, sc5)).toMatchObject({ over: true, winner: 'B', legsA: 0, legsB: 3 });
  });
});

describe('souhrn simulace v legech', () => {
  const t = custom(8, 4);
  const s = buildSchedule(t);
  const [m] = s.matches.filter((x) => x.block === 'sim');
  const row = (rows: ReturnType<typeof computeStandings>['rows'], id: string) => rows.find((r) => r.playerId === id)!;

  it('počítá se dohraný zápas (výhra týmu), ne jednotlivé legy; góly simulace nejdou do rozdílu', () => {
    const sc: Record<string, Score> = { [m.id]: { ga: 6, gb: 4 }, [legId(m.id, 2)]: { ga: 6, gb: 2 } };
    const { rows, sim } = computeStandings(s, sc, t.attendees);
    expect(sim).toEqual({ teamA: 1, teamB: 0, played: 1 });
    for (const p of m.sideA) expect(row(rows, p)).toMatchObject({ simM: 1, simW: 1, legs: 0, gf: 0 });
    for (const p of m.sideB) expect(row(rows, p)).toMatchObject({ simM: 1, simW: 0, legs: 0 });
  });

  it('nedohraný zápas se nepočítá', () => {
    const { rows, sim } = computeStandings(s, { [m.id]: { ga: 6, gb: 4 } }, t.attendees);
    expect(sim).toEqual({ teamA: 0, teamB: 0, played: 0 });
    expect(row(rows, m.sideA[0])).toMatchObject({ simM: 0, simW: 0 });
  });
});
