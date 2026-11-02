import { balancedSplit, randomTeams, reconcileTeams } from './simulation';
import { buildSchedule } from './schedule';
import type { Score } from './types';
import { H } from '../test/fixtures';

describe('balancedSplit', () => {
  it('střídavě 1 A, 2–3 B, 4–5 A …; uvnitř týmu podle pořadí', () => {
    expect(balancedSplit(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'])).toEqual({ A: ['r1', 'r4', 'r5'], B: ['r2', 'r3', 'r6'] });
  });
  it('lichý počet: tým A má o jednoho víc', () => {
    const { A, B } = balancedSplit(H(13));
    expect(A).toHaveLength(7);
    expect(B).toHaveLength(6);
  });
});

describe('týmy simulace v rozpisu', () => {
  const base = { mode: 'team' as const, tables: 4 as const, attendees: H(8) };

  it('podle nominačního pořadí: první polovina A', () => {
    expect(buildSchedule({ ...base, simSplit: 'order' }).teams).toEqual({ A: H(4), B: H(8).slice(4) });
  });

  it('podle výkonu bez výsledků: rozhoduje nominační pořadí, rozdělení vyrovnané', () => {
    expect(buildSchedule({ ...base, simSplit: 'performance', scores: {} }).teams).toEqual({
      A: ['H1', 'H4', 'H5', 'H8'],
      B: ['H2', 'H3', 'H6', 'H7'],
    });
  });

  it('podle výkonu ve scénářové lize tohoto tréninku', () => {
    const scores: Record<string, Score> = { 'league|1|2|H5+H6vH7+H8': { ga: 0, gb: 6 } };
    // pořadí: H7, H8 (+6), H1–H4 (0), H5, H6 (−6)
    expect(buildSchedule({ ...base, simSplit: 'performance', scores }).teams).toEqual({
      A: ['H7', 'H2', 'H3', 'H6'],
      B: ['H8', 'H1', 'H4', 'H5'],
    });
  });

  it('zamčené týmy mají přednost', () => {
    const simTeams = { A: ['H8', 'H7', 'H6', 'H5'], B: ['H1', 'H2', 'H3', 'H4'] };
    const s = buildSchedule({ ...base, simSplit: 'performance', simTeams });
    expect(s.teams).toEqual(simTeams);
    expect(s.matches.filter((m) => m.block === 'sim')[0].sideA).toEqual(['H8', 'H7']);
  });

  it('počty zápasů simulace se nemění (n=12: 3 dvojice + 2 singly a 2 dvojice)', () => {
    const s = buildSchedule({ mode: 'team', tables: 4, attendees: H(12), simSplit: 'performance', scores: {} });
    expect(s.summary).toMatchObject({ simDoubles: 5, simSingles: 2 });
  });
});

describe('ruční týmy', () => {
  const base = { mode: 'team' as const, tables: 4 as const, attendees: H(8) };
  it('reconcileTeams: odchozí vypadnou, noví jdou do menšího týmu (při shodě A)', () => {
    expect(reconcileTeams({ A: ['H1', 'H2', 'H9'], B: ['H3'] }, ['H1', 'H2', 'H3', 'H4', 'H5'])).toEqual({
      A: ['H1', 'H2', 'H5'],
      B: ['H3', 'H4'],
    });
  });
  it('rozpis použije ruční týmy (i nerovnoměrné)', () => {
    const simTeams = { A: ['H1', 'H2', 'H3', 'H4', 'H5'], B: ['H6', 'H7', 'H8'] };
    const s = buildSchedule({ ...base, simSplit: 'manual', simTeams });
    expect(s.teams).toEqual(simTeams);
  });
  it('ruční bez týmů → podle nominačního pořadí', () => {
    expect(buildSchedule({ ...base, simSplit: 'manual', simTeams: null }).teams).toEqual({ A: H(4), B: H(8).slice(4) });
  });
});

describe('náhodné ruční týmy', () => {
  it('zamíchá všechny hráče obou týmů a rozdělí je ve stejných velikostech; nikoho neztratí', () => {
    const teams = { A: ['a', 'b', 'c'], B: ['d', 'e', 'f', 'g'] };
    let i = 0;
    const seq = [0.9, 0.1, 0.5, 0.3, 0.7, 0.2];
    const r = randomTeams(teams, () => seq[i++ % seq.length]);
    expect(r.A).toHaveLength(3);
    expect(r.B).toHaveLength(4);
    expect([...r.A, ...r.B].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(r).not.toEqual(teams);
    // deterministické pro stejný generátor
    i = 0;
    expect(randomTeams(teams, () => seq[i++ % seq.length])).toEqual(r);
  });
});
