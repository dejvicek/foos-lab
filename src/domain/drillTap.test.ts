import { drillCount, tapDrill } from './drillTap';
import { soloMetric } from './solo';
import { computeSoloLadder } from './soloLadder';
import { training } from '../test/fixtures';
import { buildSchedule } from './schedule';
import type { Training } from './types';

const passes = soloMetric('warmupPasses'); // povedené z 20
const control = soloMetric('fiveBarControl'); // góly z 20 sérií (od 12. 11. 2026, dřív ztráty)
const streakLike = { ...soloMetric('warmupPasses'), lowerIsBetter: true }; // „méně je lépe“ počítá ✗

describe('cvičení – ťukání pokusů', () => {
  it('✓ / ✗ přičte pokus; výsledek podle cvičení (povedené; u „méně je lépe“ nepovedené)', () => {
    expect(tapDrill({}, passes, true, 1)).toEqual({ value: 1, attempts: 1 });
    expect(tapDrill({ value: 1, attempts: 1 }, passes, false, 1)).toEqual({ value: 1, attempts: 2 });
    expect(tapDrill({}, control, true, 1)).toEqual({ value: 1, attempts: 1 }); // gól
    expect(tapDrill({ value: 1, attempts: 1 }, control, false, 1)).toEqual({ value: 1, attempts: 2 }); // bez gólu
    expect(tapDrill({}, streakLike, true, 1)).toEqual({ value: 0, attempts: 1 });
    expect(tapDrill({ value: 0, attempts: 1 }, streakLike, false, 1)).toEqual({ value: 1, attempts: 2 });
  });

  it('po posledním pokusu dál nejde; Zpět vrátí pokus daného druhu', () => {
    expect(tapDrill({ value: 15, attempts: 20 }, passes, true, 1)).toBeNull();
    expect(tapDrill({ value: 15, attempts: 20 }, passes, false, -1)).toEqual({ value: 15, attempts: 19 });
    expect(tapDrill({ value: 15, attempts: 15 }, passes, false, -1)).toBeNull(); // žádný nepovedený
    expect(tapDrill({ value: 0, attempts: 0 }, passes, true, -1)).toBeNull();
  });

  it('číslem zapsaný výsledek (bez pokusů) je dokončené cvičení', () => {
    expect(drillCount({ value: 12 }, passes)).toEqual({ value: 12, attempts: 20, hits: 12, misses: 8, done: true });
    expect(drillCount({ value: 2, attempts: 5 }, streakLike)).toEqual({ value: 2, attempts: 5, hits: 3, misses: 2, done: false });
    expect(drillCount({ value: 2, attempts: 5 }, control)).toEqual({ value: 2, attempts: 5, hits: 2, misses: 3, done: false });
  });
});

describe('žebříček stanovišť z odehraných pokusů', () => {
  it('nedokončené cvičení: úspěšnost z odehraných pokusů; bez pokusů z plného počtu', () => {
    const base = training('t1', '2026-10-30', 'team', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    // klasický trénink: rozehrání (warmupPasses) má každý hráč
    const key = 'warmupPasses';
    const s = buildSchedule(base);
    expect(s.sections.length).toBeGreaterThan(0);
    const t: Training = {
      ...base,
      soloResults: { A: { [key]: 9 }, B: { [key]: 10 } },
      soloAttempts: { A: { [key]: 14 } }, // A stihl 14 pokusů, B zapsán číslem (20)
    };
    const [table] = computeSoloLadder([t], { kind: 'all' }, 'total', '2026-10-31').filter((x) => x.metric === 'warmupPasses');
    const rows = table.lowData; // 1 trénink → „málo dat“, pořadí ve skupině platí
    const a = rows.find((r) => r.playerId === 'A')!;
    const b = rows.find((r) => r.playerId === 'B')!;
    expect(a).toMatchObject({ sum: 9, sumMax: 14 });
    expect(a.rate).toBeCloseTo(9 / 14);
    expect(a.avg).toBeCloseTo((9 / 14) * 20);
    expect(b).toMatchObject({ sum: 10, sumMax: 20, rate: 0.5, avg: 10 });
    expect(rows[0].playerId).toBe('A'); // 64 % > 50 %
  });
});
