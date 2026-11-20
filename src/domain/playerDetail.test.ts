import { playerDrillHistory, playerMatchHistory } from './playerDetail';
import { newPractice, practiceRounds } from './practice';
import { setAttempts, setSolo } from './training';
import type { Training } from './types';

const game = (id: string, date: string, a: string, b: string, legs: [number, number][], bestOf = 3): Training => {
  const p = newPractice(id, date, '18:00', a, b, ['goalieWar'], { goalieWar: { bestOf, legTo: 6 } });
  const m = practiceRounds(p)[0].match!;
  return { ...p, scores: Object.fromEntries(legs.map(([x, y], i) => [i ? `${m.id}#${i + 1}` : m.id, { ga: x, gb: y }])) };
};

describe('playerMatchHistory – výsledky disciplíny po trénincích (20. 11. 2026)', () => {
  const ts = [
    game('g1', '2026-11-10', 'A', 'B', [[6, 2], [6, 4]]),
    game('g2', '2026-11-12', 'B', 'A', [[6, 5], [2, 6], [3, 6]]),
    game('g3', '2026-11-14', 'A', 'C', [[6, 1]]), // nedohraný BO3
    game('g0', '2026-10-01', 'A', 'B', [[6, 0], [6, 0]]),
  ];

  it('nejnovější nahoře, zápasy ze strany hráče, součty jako v žebříčku', () => {
    const rows = playerMatchHistory(ts, 'A', 'goalieWar', '2026-11-01', null);
    expect(rows.map((r) => r.trainingId)).toEqual(['g3', 'g2', 'g1']);
    const [g3, g2, g1] = rows;
    expect(g1).toMatchObject({ practice: true, wins: 1, losses: 0, legWins: 2, legLosses: 0, gf: 12, gc: 6 });
    expect(g1.matches[0]).toMatchObject({ partners: [], opponents: ['B'], result: 'win', legs: [{ gf: 6, gc: 2 }, { gf: 6, gc: 4 }] });
    // A hraje jako strana B: skóre otočené na hráčovu stranu
    expect(g2.matches[0]).toMatchObject({ opponents: ['B'], result: 'win', legs: [{ gf: 5, gc: 6 }, { gf: 6, gc: 2 }, { gf: 6, gc: 3 }] });
    expect(g2).toMatchObject({ wins: 1, losses: 0, legWins: 2, legLosses: 1, gf: 17, gc: 11 });
    // nedohraný zápas: leg se počítá, zápas ne
    expect(g3.matches[0].result).toBeNull();
    expect(g3).toMatchObject({ wins: 0, losses: 0, legWins: 1, legLosses: 0 });
  });

  it('jiná disciplína nebo hráč bez zápasu → nic', () => {
    expect(playerMatchHistory(ts, 'A', 'wall', null, null)).toEqual([]);
    expect(playerMatchHistory(ts, 'Z', 'goalieWar', null, null)).toEqual([]);
  });
});

describe('playerDrillHistory – výsledky cvičení po trénincích (20. 11. 2026)', () => {
  const solo = (id: string, date: string, vals: [string, number][], attempts: Record<string, number> = {}) =>
    vals.reduce((t, [k, v]) => (attempts[k] !== undefined ? setAttempts(setSolo(t, 'A', k, v), 'A', k, attempts[k]) : setSolo(t, 'A', k, v)), newPractice(id, date, '17:30', 'A', null));

  it('série v tréninku, součet z odehraných pokusů; nejnovější nahoře', () => {
    const ts = [solo('p1', '2026-11-10', [['penaltySolo@1', 7], ['penaltySolo@2', 9]]), solo('p2', '2026-11-12', [['penaltySolo@1', 4]], { 'penaltySolo@1': 10 })];
    const rows = playerDrillHistory(ts, 'A', 'penaltySolo', null, null);
    expect(rows.map((r) => r.trainingId)).toEqual(['p2', 'p1']);
    expect(rows[0]).toMatchObject({ practice: true, sum: 4, possible: 10, values: [{ value: 4, possible: 10 }] });
    expect(rows[1]).toMatchObject({ sum: 16, possible: 40, values: [{ value: 7, possible: 20 }, { value: 9, possible: 20 }] });
  });

  it('Čistá desítka: nejlepší splněný čas, 0 = nesplněno', () => {
    const ts = [solo('p1', '2026-11-10', [['streakShot3@1', 0], ['streakShot3@2', 95], ['streakShot3@3', 80]])];
    expect(playerDrillHistory(ts, 'A', 'streakShot3', null, null)[0]).toMatchObject({ best: 80, sum: 2, possible: 3 });
  });
});
