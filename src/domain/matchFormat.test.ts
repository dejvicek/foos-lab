import { cleanFormats, formatLabel, formatMins, formatOf, legId, legOf, matchState, normalizeFormat, baseMatchId } from './matchFormat';
import { bumpLimit, legOver, winnerFor } from './legState';
import { buildSchedule } from './schedule';
import { computeStandings } from './standings';
import { pruneEntries } from './training';
import { H } from '../test/fixtures';
import type { Match, Score, Training } from './types';

const base: Match = { id: 'league|1|1|AvB', block: 'league', round: 1, table: 1, kind: 'singles', sideA: ['A'], sideB: ['B'], discipline: 'normal' };
const bo = (bestOf: number, extra: Partial<Match> = {}): Match => ({ ...base, bestOf, legTo: 6, ...extra });

describe('BO formát – nastavení', () => {
  it('výchozí BO1 do 6; meze; 5:5 má pevné pravidlo; start musí jít vyhrát', () => {
    expect(formatOf(undefined, 'normal')).toEqual({ bestOf: 1, legTo: 6 });
    expect(normalizeFormat('normal', { bestOf: 0, legTo: 99 })).toEqual({ bestOf: 1, legTo: 15 });
    // jen BO1, BO2, BO3, BO5: jiný počet → nejbližší nižší povolený
    expect([4, 5, 7, 15].map((n) => normalizeFormat('normal', { bestOf: n, legTo: 6 }).bestOf)).toEqual([3, 5, 5, 5]);
    expect(normalizeFormat('start55', { bestOf: 3, legTo: 4, finalWinBy2: true, cap: 8 })).toEqual({ bestOf: 3, legTo: 6 });
    expect(normalizeFormat('start44', { bestOf: 1, legTo: 3 }).legTo).toBe(5);
    expect(normalizeFormat('goalieWar', { bestOf: 3, legTo: 5, finalWinBy2: true, cap: 4 })).toEqual({ bestOf: 3, legTo: 5, finalWinBy2: true, cap: 6 });
  });

  it('popisek a co se ukládá: jen nevýchozí formáty zápasů', () => {
    expect(formatLabel({ bestOf: 1, legTo: 6 })).toBe('');
    expect(formatLabel({ bestOf: 3, legTo: 6 })).toBe('BO3');
    expect(formatLabel({ bestOf: 5, legTo: 5, finalWinBy2: true, cap: 8 })).toBe('BO5 do 5 rozhodující leg o 2 (strop 8)');
    expect(formatLabel({ bestOf: 1, legTo: 6, finalWinBy2: true, cap: 10 })).toBe('BO1 do 6 o 2 (strop 10)');
    expect(cleanFormats({ normal: { bestOf: 1, legTo: 6 }, wall: { bestOf: 3, legTo: 6 }, penaltySolo: { bestOf: 3, legTo: 6 } })).toEqual({ wall: { bestOf: 3, legTo: 6 } });
    expect(cleanFormats({})).toBeUndefined();
  });

  it('délka kola = délka legu × nejvyšší počet legů', () => {
    expect(formatMins({ normal: 8, wall: 8 }, { normal: { bestOf: 3, legTo: 6 } })).toEqual({ normal: 24, wall: 8 });
    expect(formatMins(null, { goalieWar: { bestOf: 5, legTo: 6 } })).toEqual({ goalieWar: 40 });
    expect(formatMins({ normal: 8 }, undefined)).toEqual({ normal: 8 });
  });
});

describe('BO formát – legy', () => {
  it('leg do legTo; rozhodující leg o 2 se stropem, jiné legy ne', () => {
    const m = bo(3, { legTo: 5, finalWinBy2: true, cap: 7 });
    expect(legOver(legOf(m, 1), { ga: 5, gb: 4 }).over).toBe(true);
    const last = legOf(m, 3);
    expect(last).toMatchObject({ id: 'league|1|1|AvB#3', legNo: 3, winBy2: true });
    expect(legOver(last, { ga: 5, gb: 4 }).over).toBe(false);
    expect(legOver(last, { ga: 6, gb: 4 })).toEqual({ over: true, winner: 'A' });
    expect(legOver(last, { ga: 7, gb: 6 })).toEqual({ over: true, winner: 'A' });
    expect(bumpLimit(last, 'ga')).toBe(7);
    expect(bumpLimit(legOf(m, 1), 'ga')).toBe(5);
    expect(winnerFor(last, 5)).toBe(7);
    expect(winnerFor(legOf(m, 2), 3)).toBe(5);
  });

  it('BO3 rozhodnuté po dvou legech; BO2 hraje oba a může skončit nerozhodně', () => {
    const m = bo(3);
    const sc = (xs: [number, number][]): Record<string, Score> => Object.fromEntries(xs.map(([a, b], i) => [legId(m.id, i + 1), { ga: a, gb: b }]));
    expect(matchState(m, {})).toMatchObject({ over: false, legsA: 0, legsB: 0, current: { id: m.id } });
    expect(matchState(m, sc([[6, 2]]))).toMatchObject({ over: false, legsA: 1, current: { id: `${m.id}#2` } });
    expect(matchState(m, sc([[6, 2], [6, 5]]))).toMatchObject({ over: true, winner: 'A', legsA: 2, current: null });
    expect(matchState(m, sc([[6, 2], [3, 6], [4, 6]]))).toMatchObject({ over: true, winner: 'B', legsA: 1, legsB: 2 });
    const two = bo(2);
    expect(matchState(two, { [two.id]: { ga: 6, gb: 1 } })).toMatchObject({ over: false, current: { legNo: 2 } });
    expect(matchState(two, { [two.id]: { ga: 6, gb: 1 }, [`${two.id}#2`]: { ga: 2, gb: 6 } })).toMatchObject({ over: true, winner: null, legsA: 1, legsB: 1 });
    expect(baseMatchId(`${two.id}#2`)).toBe(two.id);
  });

  it('bez BO je zápas jeden leg jako dřív', () => {
    expect(matchState(base, { [base.id]: { ga: 6, gb: 3 } })).toMatchObject({ over: true, winner: 'A', legs: [{ over: true }] });
  });
});

describe('BO formát v rozpisu a souhrnu', () => {
  const t = (formats: Training['matchFormats']): Training => ({
    id: 't', date: '2026-11-12', startTime: '18:00', mode: 'team', tables: 2, attendees: H(4), scores: {}, soloResults: {},
    simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan: { normal: 1, wall: 2 }, lockedRounds: [], breaks: [],
    disciplineMin: { normal: 8, wall: 8 }, matchFormats: formats,
  });

  it('kolo zápasu s BO3: zápasy nesou pravidla, kolo trvá 3 × 8 min, popisek BO3', () => {
    const s = buildSchedule(t({ normal: { bestOf: 3, legTo: 5 } }));
    const rows = s.sections.flatMap((x) => x.rows).filter((r) => r.kind === 'matches');
    expect(rows[0].rule).toBe('Normální leg BO3 do 5, 24 min');
    expect(rows[1].time - rows[0].time).toBe(25);
    const m = rows[0].cells.find((c) => c?.type === 'match');
    expect(m?.type === 'match' && m.match).toMatchObject({ bestOf: 3, legTo: 5 });
    expect(rows[1].rule).toBe('Zeď, 8 min');
  });

  it('souhrn počítá každý leg; úklid nechá skóre dalších legů', () => {
    const tr = t({ normal: { bestOf: 3, legTo: 6 } });
    const s = buildSchedule(tr);
    const m = s.matches.find((x) => x.discipline === 'normal')!;
    const scores = { [m.id]: { ga: 6, gb: 2 }, [`${m.id}#2`]: { ga: 4, gb: 6 }, [`${m.id}#3`]: { ga: 6, gb: 5 } };
    const st = computeStandings(s, scores, tr.attendees);
    const a = st.rows.find((r) => r.playerId === m.sideA[0])!;
    expect(a).toMatchObject({ legs: 3, wins: 2, gf: 16, gc: 13 });
    expect(Object.keys(pruneEntries({ ...tr, scores }).scores).sort()).toEqual(Object.keys(scores).sort());
  });
});
