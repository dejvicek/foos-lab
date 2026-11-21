import { bestsOf, fullSeries, recordNews, recordsOf } from './records';
import { newPractice } from './practice';
import { setAttempts, setSolo } from './training';
import type { Training } from './types';

const solo = (id: string, players: [string] | [string, string], vals: [string, string, number, number?][]): Training =>
  vals.reduce<Training>((t, [p, k, v, att]) => (att !== undefined ? setAttempts(setSolo(t, p, k, v), p, k, att) : setSolo(t, p, k, v)), newPractice(id, '2026-11-10', '17:30', players[0], players[1] ?? null));

describe('rekordy cvičení (20. 11. 2026)', () => {
  it('celá série: jen všechny pokusy; nedohraná a starší s 10 pokusy ne; desítka jen splněná', () => {
    const t = solo('p', ['A'], [['A', 'penaltySolo@1', 14], ['A', 'penaltySolo@2', 9, 12], ['A', 'penaltySolo@3', 6, 10], ['A', 'streakShot3@1', 0], ['A', 'streakShot3@2', 80]]);
    expect(fullSeries(t, 'A', 'penaltySolo@1')).toBe(14);
    expect(fullSeries(t, 'A', 'penaltySolo@2')).toBeNull();
    expect(fullSeries(t, 'A', 'penaltySolo@3')).toBeNull();
    expect(fullSeries(t, 'A', 'streakShot3@1')).toBeNull();
    expect(fullSeries(t, 'A', 'streakShot3@2')).toBe(80);
  });

  it('osobní ze všech sérií bez té právě dohrané; klub jen z tréninků ve dvou a klubových', () => {
    const solo1 = solo('s', ['A'], [['A', 'penaltyKeeper@1', 17]]); // solo – do klubu se nepočítá
    const duo = solo('d', ['A', 'B'], [['A', 'penaltyKeeper@1', 12], ['B', 'penaltyKeeper@1', 15]]);
    const now = solo('n', ['A', 'B'], [['A', 'penaltyKeeper@1', 16]]);
    const b = bestsOf([solo1, duo, now], 'penaltyKeeper', 'A', { trainingId: 'n', key: 'penaltyKeeper@1' });
    expect(b).toEqual({ personal: 17, club: 15, clubHolder: 'B', clubCounts: true });
    expect(recordNews('penaltyKeeper', 16, b)).toEqual({ kind: 'club' }); // 16 > 15 v klubu, osobní 17 ze sóla
  });

  it('zprávy: nový osobní rekord, vyrovnaný, jinak maximum; první série nic', () => {
    const b = { personal: 14, club: null, clubHolder: null, clubCounts: false };
    expect(recordNews('penaltySolo', 15, b)).toEqual({ kind: 'personal', before: 14 });
    expect(recordNews('penaltySolo', 14, b)).toEqual({ kind: 'equal' });
    expect(recordNews('penaltySolo', 11, b)).toEqual({ kind: 'max', best: 14 });
    expect(recordNews('penaltySolo', 11, { personal: null, club: null, clubHolder: null, clubCounts: false })).toBeNull();
  });

  it('Čistá desítka: méně sekund je lépe', () => {
    expect(recordNews('streakShot3', 70, { personal: 80, club: null, clubHolder: null, clubCounts: false })).toEqual({ kind: 'personal', before: 80 });
    expect(recordNews('streakShot3', 95, { personal: 80, club: null, clubHolder: null, clubCounts: false })).toEqual({ kind: 'max', best: 80 });
  });
});

describe('recordsOf – rekordy na profilu', () => {
  it('jen cvičení s celou sérií; rekord klubu s držitelem', () => {
    const duo = solo('d', ['A', 'B'], [['A', 'penaltyKeeper@1', 12], ['B', 'penaltyKeeper@1', 15], ['A', 'penaltySolo@1', 5, 8]]);
    expect(recordsOf([duo], 'A')).toEqual([{ metric: 'penaltyKeeper', personal: 12, club: 15, clubHolder: 'B' }]);
  });
});
