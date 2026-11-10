import { DEFAULT_DISCIPLINES, discipline } from './disciplines';
import { disciplineHelp } from './disciplineInfo';
import { SOLO_METRICS } from './solo';
import { WARMUP_PHASES } from './content';
import { isWarmupItem, WARMUP_TOTAL_SEC, warmupRunning, warmupState } from './warmup';
import { drillRoundsNeeded } from './plan';
import { buildSchedule } from './schedule';
import { soloSlots } from './solo';
import { drillItemId, queueOf } from './queue';
import type { ScheduleRow, Training } from './types';
import { H } from '../test/fixtures';

describe('Rozcvička – disciplína a timer', () => {
  it('Rozcvička: cvičení bez metriky, individuální, první v katalogu', () => {
    expect(DEFAULT_DISCIPLINES[0]).toMatchObject({ id: 'warmup', kind: 'drill', name: 'Rozcvička', min: 9, individual: true, skills: ['control', 'pass5'] });
    expect(discipline('warmup').metric).toBeUndefined();
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

const custom = (n: number, tables: 1 | 2 | 3 | 4, plan: Training['plan']): Training => ({
  id: 'w', date: '2026-11-10', startTime: '18:00', mode: 'team', tables, attendees: H(n), scores: {}, soloResults: {},
  simSplit: 'performance', simTeams: null, format: 'custom', durationMin: 180, plan, lockedRounds: [], breaks: [],
});
const play = (t: Training) => buildSchedule(t).sections.flatMap((s) => s.rows).filter((r) => r.kind !== 'break');
const groupsOf = (r: ScheduleRow) => r.cells.flatMap((c) => (c?.type === 'group' ? [c.players] : []));

describe('Rozcvička v rozpisu', () => {
  for (let n = 4; n <= 13; n++)
    for (const tables of [2, 3, 4] as const)
      it(`n=${n}, stoly=${tables}: každý jednou, u stolu nejvýš 2 (lichý sám u volného)`, () => {
        const rounds = drillRoundsNeeded(n, tables);
        const rows = play(custom(n, tables, { warmup: rounds }));
        expect(rows).toHaveLength(rounds);
        const seen = rows.flatMap((r) => groupsOf(r).flat());
        expect([...seen].sort()).toEqual([...H(n)].sort());
        for (const r of rows) {
          expect(groupsOf(r).every((g) => g.length <= 2)).toBe(true);
          expect(groupsOf(r).length).toBeLessThanOrEqual(tables);
          expect(r.waitingLabel).toBe('Čeká');
          expect(r.cells.every((c) => c?.type !== 'group' || c.metric === undefined)).toBe(true);
        }
      });

  it('7 hráčů / 4 stoly: 3 dvojice + 1 sám', () => {
    expect(groupsOf(play(custom(7, 4, { warmup: 1 }))[0]).map((g) => g.length)).toEqual([2, 2, 2, 1]);
  });

  it('ostatní cvičení beze změny: 7 / 4 u Přihrávek na pětce = trojice u posledního stolu', () => {
    const r = play(custom(7, 4, { warmupPasses: 1 }))[0];
    expect(groupsOf(r).map((g) => g.length)).toEqual([2, 2, 3]);
    expect(r.waitingLabel).toBeUndefined();
  });

  it('Rozcvička nemá sólové sloty a fronta zná disciplínu', () => {
    const s = buildSchedule(custom(8, 4, { warmup: 1, normal: 1 }));
    expect(soloSlots(s)).toEqual([]);
    const row = s.sections[0].rows[0];
    const id = drillItemId(row, 1, groupsOf(row)[0]);
    expect(isWarmupItem(s, id)).toBe(true);
    expect(isWarmupItem(s, 'nic')).toBe(false);
    const items = queueOf(s).filter((e) => e.kind === 'item');
    expect(items.find((e) => e.id === id)).toMatchObject({ discipline: 'warmup' });
  });
});

describe('Rozcvička – běží (kvůli potvrzení Ukončit)', () => {
  it('warmupRunning: zahájená a nedoběhlá; ne po 8:35, ne nezahájená, ne zápas', () => {
    const s = buildSchedule(custom(8, 4, { warmup: 1, normal: 1 }));
    const row = s.sections[0].rows[0];
    const id = drillItemId(row, 1, groupsOf(row)[0]);
    const t0 = 5_000_000;
    expect(warmupRunning(s, id, t0, t0 + 100_000)).toBe(true);
    expect(warmupRunning(s, id, t0, t0 + 515_000)).toBe(false);
    expect(warmupRunning(s, id, undefined, t0)).toBe(false);
    const m = s.sections.flatMap((x) => x.rows).flatMap((r) => r.cells).find((c) => c?.type === 'match');
    expect(m?.type === 'match' && warmupRunning(s, m.match.id, t0, t0 + 100_000)).toBe(false);
  });
});
