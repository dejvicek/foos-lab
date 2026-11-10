import { DEFAULT_DISCIPLINES, discipline } from './disciplines';
import { disciplineHelp } from './disciplineInfo';
import { DEFAULT_SELECTION } from './plan';
import { SOLO_METRICS } from './solo';
import { WARMUP_PHASES } from './content';
import { WARMUP_TOTAL_SEC, warmupState } from './warmup';

describe('Rozcvička – disciplína a timer', () => {
  it('Rozcvička: cvičení bez metriky, individuální, volitelná, první v katalogu', () => {
    expect(DEFAULT_DISCIPLINES[0]).toMatchObject({ id: 'warmup', kind: 'drill', name: 'Rozcvička', min: 9, individual: true, optional: true, skills: ['control', 'pass5'] });
    expect(discipline('warmup').metric).toBeUndefined();
    expect(DEFAULT_SELECTION).not.toContain('warmup');
    expect(SOLO_METRICS.map((m) => m.id as string)).not.toContain('warmup');
    expect(disciplineHelp('warmup')[0].name).toBe('Rozcvička');
    expect(disciplineHelp('warmup')[0].parts.map((p) => p.label)).toEqual(['Cíl:', 'Provedení:']);
  });

  it('fáze: 7, 4× kroužení na dvojce, absorbování, tic-tac, postupka na pětce; celkem 8:35', () => {
    expect(WARMUP_PHASES.map((p) => [p.rod, p.sec])).toEqual([
      ['twoBar', 60], ['twoBar', 60], ['twoBar', 60], ['twoBar', 60], ['fiveBar', 60], ['fiveBar', 60], ['fiveBar', 120],
    ]);
    expect(WARMUP_PHASES.map((p) => p.name)).toEqual([
      'Kroužení kolem míčku – pravá ruka, po směru',
      'Kroužení kolem míčku – pravá ruka, proti směru',
      'Kroužení kolem míčku – levá ruka, po směru',
      'Kroužení kolem míčku – levá ruka, proti směru',
      'Absorbování – nahrávka, zastavit, zpět',
      'Tic-tac nahrávky',
      'Postupka – nahrávky mezi všemi panáčky po dvou',
    ]);
    expect(WARMUP_TOTAL_SEC).toBe(515);
  });

  it('warmupState: hranice přípravy a fází', () => {
    expect(warmupState(-3)).toMatchObject({ done: false, index: 0, prep: true, remainingSec: 5 });
    expect(warmupState(0)).toMatchObject({ index: 0, prep: true, remainingSec: 5 });
    expect(warmupState(4.2)).toMatchObject({ index: 0, prep: true, remainingSec: 1 });
    expect(warmupState(5)).toMatchObject({ index: 0, prep: false, remainingSec: 60, next: WARMUP_PHASES[1] });
    expect(warmupState(64.5)).toMatchObject({ index: 0, prep: false, remainingSec: 1 });
    expect(warmupState(65)).toMatchObject({ index: 1, prep: true, remainingSec: 5 });
    expect(warmupState(390)).toMatchObject({ index: 6, prep: true });
    expect(warmupState(395)).toMatchObject({ index: 6, prep: false, remainingSec: 120, next: null });
    expect(warmupState(514.1)).toMatchObject({ index: 6, remainingSec: 1 });
    expect(warmupState(515)).toEqual({ done: true, total: 7 });
  });
});
