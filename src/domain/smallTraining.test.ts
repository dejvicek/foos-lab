import { buildSchedule, canBuildSchedule, minPlayers } from './schedule';
import { autoPlan, plannedMinutes } from './plan';
import type { Training } from './types';
import { DEFAULT_SELECTION, H, training } from '../test/fixtures';

const custom = (n: number, plan = autoPlan(DEFAULT_SELECTION, 120, n, 4)): Training => ({
  ...training('s', '2026-11-02', 'team', H(n), 4),
  format: 'custom',
  durationMin: 120,
  plan,
});

describe('trénink pro 2–3 hráče', () => {
  it('konfigurovatelný jde od 1 hráče, klasický dál od 4', () => {
    expect(minPlayers(custom(2))).toBe(1); // i trénink pro 1 hráče
    expect(canBuildSchedule(custom(2))).toBe(true);
    expect(canBuildSchedule(custom(1))).toBe(true);
    expect(canBuildSchedule(custom(0))).toBe(false);
    expect(canBuildSchedule({ ...custom(3), format: 'classic' })).toBe(false);
  });

  it('simulace zůstane vybraná, ale při méně než 4 hráčích se nepočítá do času', () => {
    const plan = autoPlan(DEFAULT_SELECTION, 120, 3, 4);
    expect(plan.sim).toBe(1);
    expect(plannedMinutes(plan, 3)).toBe(plannedMinutes({ ...plan, sim: 0 }));
    expect(plannedMinutes(plan, 4)).toBeGreaterThan(plannedMinutes(plan, 3));
  });

  for (const n of [2, 3])
    it(`n=${n}: jen singly, žádná simulace ani když je v plánu, cvičení bez samotného hráče`, () => {
      const s = buildSchedule(custom(n, { setShooting: 1, normal: 2, wall: 1, sim: 1 }));
      expect(s.sections.map((x) => x.id)).not.toContain('sim');
      expect(s.matches.every((m) => m.kind === 'singles')).toBe(true);
      const drill = s.sections.flatMap((x) => x.rows).find((r) => r.kind === 'groups')!;
      const groups = drill.cells.filter(Boolean);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.type === 'group' && groups[0]!.players.length).toBe(n);
      if (n === 3) expect(s.sections.flatMap((x) => x.rows).filter((r) => r.kind === 'matches').every((r) => r.waiting.length === 1)).toBe(true);
    });
});
