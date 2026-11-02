import { mergeRemote, mergeTrainingEcho } from './merge';
import type { AppData } from '../storage/repository';
import type { LockedRound, Training } from '../domain/types';

const t = (over: Partial<Training> = {}): Training => ({
  id: 't1', date: '2026-11-02', startTime: '18:00', mode: 'team', tables: 4, attendees: ['a', 'b'], scores: {}, soloResults: {},
  simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan: {}, lockedRounds: [], ...over,
});
const lr = (n: number): LockedRound[] => Array.from({ length: n }, () => ({ discipline: 'normal', rows: [] }) as unknown as LockedRound);
const none = () => false;

describe('slučování dat ze serveru s lokálními čekajícími zápisy', () => {
  it('bez čekajících zápisů vyhrává server (skóre, výsledky, konfigurace, smazané)', () => {
    const local: AppData = { players: [], trainings: [t({ scores: { m1: { ga: 1, gb: 0 }, m2: { ga: 3, gb: 3 } } }), t({ id: 'gone' })] };
    const remote: AppData = { players: [], trainings: [t({ tables: 3, scores: { m1: { ga: 4, gb: 0 } }, soloResults: { a: { chain: 2 } } })] };
    expect(mergeRemote(local, remote, none)).toEqual(remote);
  });

  it('čekající zápis zápasu / výsledku / tréninku si ponechá lokální hodnotu', () => {
    const local: AppData = {
      players: [],
      trainings: [t({ tables: 2, scores: { m1: { ga: 5, gb: 0 } }, soloResults: { a: { chain: 7 } } }), t({ id: 'new' })],
    };
    const remote: AppData = { players: [], trainings: [t({ tables: 3, scores: { m1: { ga: 4, gb: 0 } }, soloResults: { a: { chain: 2 } }, lockedRounds: lr(2) })] };
    const busy = (k: string) => ['t1::m1', 't1::solo::a::chain', 't1::training', 'new::training'].includes(k);
    const out = mergeRemote(local, remote, busy);
    const t1 = out.trainings.find((x) => x.id === 't1')!;
    expect(t1.scores.m1).toEqual({ ga: 5, gb: 0 });
    expect(t1.soloResults.a.chain).toBe(7);
    expect(t1.tables).toBe(2);
    expect(t1.lockedRounds).toHaveLength(2); // zamčení ze serveru se nezkrátí
    expect(out.trainings.map((x) => x.id)).toContain('new'); // ještě neuložený nový trénink
  });

  it('ozvěna tréninku: bez čekajícího zápisu převezme vše kromě skóre; s čekajícím jen delší zamčení kol', () => {
    const cur = t({ tables: 2, lockedRounds: lr(1), scores: { m1: { ga: 1, gb: 0 } } });
    const echo = t({ tables: 3, lockedRounds: lr(3), simTeams: { A: ['a'], B: ['b'] } });
    expect(mergeTrainingEcho(cur, echo, false)).toEqual({ ...echo, scores: cur.scores, soloResults: cur.soloResults });
    const busy = mergeTrainingEcho(cur, echo, true);
    expect(busy.tables).toBe(2);
    expect(busy.lockedRounds).toHaveLength(3);
    expect(busy.simTeams).toEqual({ A: ['a'], B: ['b'] });
    expect(mergeTrainingEcho(t({ lockedRounds: lr(4) }), echo, true).lockedRounds).toHaveLength(4);
  });
});
