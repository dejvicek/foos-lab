import { activeFor } from './active';
import type { Training } from '../domain/types';
import { buildSchedule } from '../domain/schedule';
import { queueOf } from '../domain/queue';

const t = (over: Partial<Training> = {}): Training => ({
  id: 't1', date: '2026-11-02', startTime: '18:00', mode: 'team', tables: 2, attendees: ['a', 'b', 'c', 'd'],
  scores: {}, soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 60, plan: { normal: 2 }, lockedRounds: [], breaks: [], ...over,
});
const NOW = new Date(2026, 10, 2, 18, 30).getTime();
const ids = queueOf(buildSchedule(t())).flatMap((e) => (e.kind === 'item' ? [e.id] : []));

describe('běžící trénink pro hráče (Živě / Moje hry)', () => {
  it('nezahájený trénink ani trénink, kde nejsem, není aktivní', () => {
    expect(activeFor([t()], 'a', NOW)).toBeNull();
    expect(activeFor([t({ playTimes: { training: { startedAt: NOW - 60_000 } } })], 'x', NOW)).toBeNull();
  });

  it('zahájený trénink, kde jsem: aktivní; moje hra = utkání na řadě nebo rozehrané', () => {
    const a = activeFor([t({ playTimes: { training: { startedAt: NOW - 60_000 } } })], 'a', NOW)!;
    expect(a.training.id).toBe('t1');
    expect(a.myTurn).toBe(true); // 1. kolo čeká na zahájení
    const playing = activeFor([t({ playTimes: { training: { startedAt: NOW - 60_000 }, [ids[0]]: { startedAt: NOW - 30_000 } } })], 'a', NOW)!;
    expect(playing.myTurn).toBe(false); // hraje, nečeká na zahájení
    expect(playing.myGame).toBe(true);
  });

  it('dohraný trénink ani zahájený před víc než 12 h není aktivní; z více běžících ten naposledy zahájený', () => {
    const done = t({ playTimes: { training: { startedAt: NOW - 3_600_000 }, [ids[0]]: { startedAt: NOW - 3_000_000, endedAt: NOW - 2_900_000 }, [ids[1]]: { startedAt: NOW - 2_800_000, endedAt: NOW - 2_700_000 } } });
    expect(activeFor([done], 'a', NOW)).toBeNull();
    expect(activeFor([t({ playTimes: { training: { startedAt: NOW - 13 * 3_600_000 } } })], 'a', NOW)).toBeNull();
    const older = t({ id: 'old', playTimes: { training: { startedAt: NOW - 600_000 } } });
    const newer = t({ id: 'new', playTimes: { training: { startedAt: NOW - 60_000 } } });
    expect(activeFor([older, newer], 'a', NOW)!.training.id).toBe('new');
  });
});

describe('organizátor, který nehraje', () => {
  it('vidí běžící trénink (Živě), ale nemá Moje hry', () => {
    const run = t({ createdBy: 'org', playTimes: { training: { startedAt: NOW - 60_000 } } });
    const a = activeFor([run], 'org', NOW)!;
    expect(a.training.id).toBe('t1');
    expect(a.plays).toBe(false);
    expect(a.myGame).toBe(false);
    expect(activeFor([run], 'a', NOW)!.plays).toBe(true);
    expect(activeFor([run], 'cizi', NOW)).toBeNull();
  });
});
