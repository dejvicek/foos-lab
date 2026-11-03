import { clockAt, SOLO_METRICS, soloMetric, soloSlots } from './solo';
import { buildSchedule } from './schedule';
import { STATIONS } from './content';
import type { SoloMetric, TableCount } from './types';
import { H } from '../test/fixtures';

const team = (n: number, t: TableCount) => buildSchedule({ mode: 'team', tables: t, attendees: H(n) });
const count = (slots: { metric: SoloMetric; playerId: string }[], m: SoloMetric) => slots.filter((s) => s.metric === m).length;

describe('clockAt', () => {
  it('přičte offset ke skutečnému času začátku', () => {
    expect(clockAt('18:00', 69)).toBe('19:09');
    expect(clockAt('17:30', 0)).toBe('17:30');
  });
  it('přes půlnoc pokračuje od 0:00', () => {
    expect(clockAt('23:00', 69)).toBe('0:09');
  });
});

describe('SOLO_METRICS', () => {
  it('metriky podle PRD 5.8 (+ cvičení z 2. 11. 2026), jen pětka je „méně je lépe“', () => {
    expect(SOLO_METRICS.map((m) => [m.id, m.max])).toEqual([
      ['warmupPasses', 20], ['passWallLane', 10], ['fiveBarControl', 10], ['fiveBarSolo', 10], ['setShooting', 20],
      ['penaltyKeeper', 10], ['penaltySolo', 10], ['backShotKeeper', 10], ['backShotSolo', 10],
      ['clearing', 10], ['looseBall', 10], ['backRodsBuildUp', 10], ['chain', 10],
    ]);
    expect(SOLO_METRICS.filter((m) => m.lowerIsBetter).map((m) => m.id)).toEqual(['fiveBarControl', 'fiveBarSolo']);
    expect(soloMetric('setShooting').what).toBe('góly z 20 střel');
  });
});

describe('metriky v rozpisu', () => {
  it('kritérium 15: n=8, t=4, rotace 2, stůl 1 = H4+H8 na pětce', () => {
    const solo = team(8, 4).sections.find((s) => s.id === 'solo')!;
    const rot2 = solo.rows.find((r) => r.label === 'Stanoviště, rotace 2')!;
    expect(rot2.cells[0]).toEqual({ type: 'group', players: ['H4', 'H8'], station: STATIONS[0], metric: 'fiveBarControl' });
  });

  it('týmový n=8, t=4: každý hráč má rozehrání a každé stanoviště se zápisem právě jednou (Obrana do držení už bez zápisu)', () => {
    const slots = soloSlots(team(8, 4));
    expect(slots.some((x) => (x.metric as string) === 'blockToControl')).toBe(false);
    for (const m of ['warmupPasses', 'fiveBarControl', 'setShooting', 'backRodsBuildUp'] as SoloMetric[])
      expect(count(slots, m)).toBe(8);
    expect(new Set(slots.map((s) => `${s.playerId}:${s.metric}`)).size).toBe(slots.length);
  });

  it('týmový n=8, t=3: stanoviště 4 se nehraje', () => {
    expect(count(soloSlots(team(8, 3)), 'backRodsBuildUp')).toBe(0);
  });

  it('jedničky n=5: rozehrání = rozehrávka ze zadku, plus řetězec', () => {
    const slots = soloSlots(buildSchedule({ mode: 'single', tables: 2, attendees: H(5) }));
    expect(count(slots, 'backRodsBuildUp')).toBe(5);
    expect(count(slots, 'chain')).toBe(5);
    expect(count(slots, 'fiveBarControl')).toBe(0);
  });
});

describe('klíče výsledků sólové části', () => {
  it('klasický = metrika, custom = metrika@kolo', async () => {
    const { soloKey, parseSoloKey } = await import('./solo');
    expect(soloKey('setShooting')).toBe('setShooting');
    expect(soloKey('setShooting', 4)).toBe('setShooting@4');
    expect(parseSoloKey('setShooting@4')).toEqual({ metric: 'setShooting', round: 4 });
    expect(parseSoloKey('chain')).toEqual({ metric: 'chain', round: 0 });
  });
});
