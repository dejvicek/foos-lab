import { idbSnapshot, memorySnapshot, withoutEvents } from './snapshot';
import type { Training } from '../domain/types';

const t: Training = { id: 't1', date: '2026-11-10', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan: {}, lockedRounds: [], mode: 'team', tables: 2, attendees: [], scores: {} };

describe('uložený stav appky', () => {
  it('memorySnapshot: uloží, načte kopii, smaže', async () => {
    const box = memorySnapshot();
    expect(await box.load()).toBeNull();
    const snap = { data: { players: [], trainings: [t] }, cursor: 'c1', savedAt: 5 };
    await box.save(snap);
    snap.data.trainings.push({ ...t, id: 't2' });
    expect((await box.load())?.data.trainings).toHaveLength(1);
    await box.clear();
    expect(await box.load()).toBeNull();
  });

  it('withoutEvents: průběh her se neukládá (načítá se znovu u otevřeného tréninku)', () => {
    const e = { id: 'e1', itemId: 'm', at: 1, kind: 'goal' as const, side: 'A' as const, delta: 1 as const };
    const out = withoutEvents({ players: [], trainings: [{ ...t, events: [e], scores: { m: { ga: 1, gb: 0 } } }], cursor: 'x' });
    expect(out.trainings[0].events).toBeUndefined();
    expect(out.trainings[0].scores).toEqual({ m: { ga: 1, gb: 0 } });
    expect(out.cursor).toBeUndefined();
  });

  it('idbSnapshot: bez IndexedDB (starý prohlížeč, testy) nic neukládá a nic nehlásí', async () => {
    const box = idbSnapshot('hrac-1');
    await box.save({ data: { players: [], trainings: [] }, cursor: null, savedAt: 1 });
    expect(await box.load()).toBeNull();
    await box.clear();
  });
});
