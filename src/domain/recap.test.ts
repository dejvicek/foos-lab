import { trainingRecap } from './recap';
import { scoreFor, training } from '../test/fixtures';
import { setSolo } from './training';

const TODAY = '2026-10-31';
const day = (id: string, date: string, who: string, s: [number, number][]) =>
  scoreFor(training(id, date, 'single', [who, `${who}2`, `${who}3`, `${who}4`], 2), who, s);

describe('trainingRecap – Tvůj trénink (20. 11. 2026)', () => {
  it('dnešní místo, rozdíl a legy; posun v žebříčku proti stavu bez tohoto tréninku', () => {
    const ts = [
      day('a1', '2026-10-10', 'A', [[6, 4]]), day('a2', '2026-10-11', 'A', [[6, 4]]), day('a3', '2026-10-12', 'A', [[6, 4]]),
      day('b1', '2026-10-10', 'B', [[6, 5]]), day('b2', '2026-10-11', 'B', [[6, 5]]), day('b3', '2026-10-12', 'B', [[6, 5]]),
    ];
    const today = day('b4', '2026-10-31', 'B', [[6, 0], [6, 0], [6, 0], [6, 0], [6, 0]]);
    const r = trainingRecap([...ts, today], today, 'B', TODAY)!;
    expect(r).toMatchObject({ trainingId: 'b4', place: 1, diff: 30, legWins: 5, legLosses: 0 });
    expect(r.of).toBeGreaterThan(1);
    expect(r.move).toBeGreaterThan(0); // B předběhl A
    expect(r.missing).toBeUndefined();
  });

  it('pod čarou: kolik tréninků do pořadí chybí; cvičení s výsledky', () => {
    const t = setSolo(day('x', '2026-10-31', 'C', [[3, 6]]), 'C', 'fiveBarControl', 12);
    const r = trainingRecap([t], t, 'C', TODAY)!;
    expect(r).toMatchObject({ place: 2, legWins: 0, legLosses: 1, missing: 2 });
  });

  it('hráč, který nebyl přítomen, závěr nemá', () => {
    const t = day('x', '2026-10-31', 'C', [[3, 6]]);
    expect(trainingRecap([t], t, 'Z', TODAY)).toBeNull();
  });
});
