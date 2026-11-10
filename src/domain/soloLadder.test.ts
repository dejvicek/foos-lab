import { aggregateSolo, computeSoloLadder } from './soloLadder';
import { playerHistory } from './ladder';
import { setSolo } from './training';
import { training } from '../test/fixtures';
import { H } from '../test/fixtures';
import type { Training } from './types';

const TODAY = '2026-10-31';
const t = (id: string, date: string, vals: [string, 'fiveBarControl' | 'setShooting', number][]): Training =>
  vals.reduce((acc, [p, m, v]) => setSolo(acc, p, m, v), training(id, date, 'team', H(8), 4));

// A: pětka 2 a 4; B: pětka 5 a 5; C: jen jednou 1
const t1 = t('t1', '2026-10-20', [['H1', 'fiveBarControl', 2], ['H2', 'fiveBarControl', 5], ['H3', 'fiveBarControl', 1], ['H1', 'setShooting', 10], ['H2', 'setShooting', 15]]);
const t2 = t('t2', '2026-10-25', [['H1', 'fiveBarControl', 4], ['H2', 'fiveBarControl', 5], ['H1', 'setShooting', 12], ['H2', 'setShooting', 15]]);
// třetí trénink: H1 a H2 mají 3 tréninky → v Průměru se řadí (H3 s 1 tréninkem ne)
const t3 = t('t3', '2026-10-27', [['H1', 'fiveBarControl', 3], ['H2', 'fiveBarControl', 5], ['H1', 'setShooting', 14], ['H2', 'setShooting', 15]]);
const five = (tables: ReturnType<typeof computeSoloLadder>) => tables.find((x) => x.metric === 'fiveBarControl')!;

describe('computeSoloLadder', () => {
  it('kritérium 16: průměr 3,0 / 10, celkem 6 / 20, méně ztrát je lépe; se 2 tréninky ještě „málo dat“', () => {
    const avg = five(computeSoloLadder([t1, t2], { kind: 'all' }, 'avg', TODAY));
    expect(avg.ranked).toEqual([]);
    expect(avg.lowData.map((r) => r.playerId)).toEqual(['H3', 'H1', 'H2']);
    expect(avg.lowData[1]).toMatchObject({ trainings: 2, sum: 6, sumMax: 20, avg: 3 });
    const total = five(computeSoloLadder([t1, t2], { kind: 'all' }, 'total', TODAY));
    expect(total.ranked).toEqual([]);
    expect(total.lowData.map((r) => r.playerId)).toEqual(['H3', 'H1', 'H2']);
    expect(total.lowData[1]).toMatchObject({ sum: 6, sumMax: 20 });
  });

  it('s 3 tréninky se v Průměru řadí: 9 / 30 před 15 / 30', () => {
    const avg = five(computeSoloLadder([t1, t2, t3], { kind: 'all' }, 'avg', TODAY));
    expect(avg.ranked.map((r) => r.playerId)).toEqual(['H1', 'H2']);
    expect(avg.ranked[0]).toMatchObject({ trainings: 3, sum: 9, sumMax: 30, avg: 3 });
    expect(avg.lowData.map((r) => r.playerId)).toEqual(['H3']);
    const total = five(computeSoloLadder([t1, t2, t3], { kind: 'all' }, 'total', TODAY));
    expect(total.ranked.map((r) => r.playerId)).toEqual(['H1', 'H2']);
    expect(total.lowData.map((r) => r.playerId)).toEqual(['H3']);
  });

  it('střelba: víc je lépe', () => {
    const shoot = computeSoloLadder([t1, t2, t3], { kind: 'all' }, 'avg', TODAY).find((x) => x.metric === 'setShooting')!;
    expect(shoot.ranked.map((r) => r.playerId)).toEqual(['H2', 'H1']);
    expect(shoot.ranked[0].avg).toBe(15);
  });

  it('jen metriky se záznamem, v pořadí SOLO_METRICS', () => {
    expect(computeSoloLadder([t1, t2], { kind: 'all' }, 'avg', TODAY).map((x) => x.metric)).toEqual(['fiveBarControl', 'setShooting']);
  });

  it('období: forma od 4. 10. vyřadí starší trénink', () => {
    const old = t('old', '2026-09-01', [['H4', 'fiveBarControl', 0]]);
    const res = five(computeSoloLadder([old, t1, t2], { kind: 'form' }, 'total', TODAY));
    expect([...res.ranked, ...res.lowData].map((r) => r.playerId)).not.toContain('H4');
  });

  it('hodnota bez místa v rozpisu se nepočítá', () => {
    const bad = setSolo(training('x', '2026-10-30', 'single', H(5), 2), 'H1', 'fiveBarControl', 0);
    expect(computeSoloLadder([bad], { kind: 'all' }, 'total', TODAY)).toEqual([]);
  });
});

describe('playerHistory – sólová část', () => {
  it('vrací i hodnoty ze sólové části', () => {
    const h = playerHistory([t1, t2], 'H1', { kind: 'all' }, TODAY);
    expect(h[0].solo).toEqual({ fiveBarControl: 4, setShooting: 12 });
  });
});

describe('žebříček stanovišť – víc záznamů v jednom tréninku', () => {
  it('průměr na záznam, tréninky = počet tréninků se záznamem', () => {
    const t = training('c1', '2026-10-30', 'team', H(8), 4);
    const raw = (x: typeof t) => x.soloResults;
    const rows = aggregateSolo([{ ...t, soloResults: { H1: { 'setShooting@1': 10, 'setShooting@5': 14 } } }], 'setShooting', raw);
    expect(rows.get('H1')).toEqual({ trainings: 1, records: 2, sum: 24, possible: 40 }); // 2 × 20 střel (zapsáno číslem)
  });
});
