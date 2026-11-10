import { applyChanges, mergeRemote, mergeTrainingEcho } from './merge';
import type { AppData, Changes } from '../storage/repository';
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

describe('dorovnání jen o změny (applyChanges)', () => {
  const ch = (over: Partial<Changes> = {}): Changes => ({
    cursor: 'c2', players: [], trainings: [], scores: [], solo: [], playTimes: [],
    deleted: { players: [], trainings: [], scores: [], solo: [], playTimes: [] }, ...over,
  });
  const p = (id: string, name = id) => ({ id, name, archived: false, order: 0 });

  it('prázdné změny nechají stav beze změny (i identitu tréninků – rozpis se nepřepočítává)', () => {
    const local: AppData = { players: [p('a')], trainings: [t({ scores: { m1: { ga: 1, gb: 0 } } })], catalog: {} };
    const out = applyChanges(local, ch(), none);
    expect(out).toEqual(local);
    expect(out.trainings[0]).toBe(local.trainings[0]);
  });

  it('změněné skóre, výsledky a časy se zapíšou do svého tréninku, smazané zmizí', () => {
    const local: AppData = {
      players: [],
      trainings: [t({ scores: { m1: { ga: 1, gb: 0 }, m2: { ga: 2, gb: 2 } }, soloResults: { a: { chain: 2, 'x@1': 5 } }, soloAttempts: { a: { 'x@1': 7 } }, playTimes: { m1: { startedAt: 10 }, m2: { startedAt: 20 } } }), t({ id: 't2' })],
    };
    const out = applyChanges(
      local,
      ch({
        scores: [{ trainingId: 't1', matchId: 'm1', score: { ga: 4, gb: 0 } }, { trainingId: 't1', matchId: 'm3', score: { ga: 0, gb: 1 } }],
        solo: [{ trainingId: 't1', playerId: 'a', key: 'chain', value: 9, attempts: 12 }, { trainingId: 't1', playerId: 'b', key: 'chain', value: 1, attempts: null }],
        playTimes: [{ trainingId: 't1', itemId: 'm1', time: { startedAt: 10, endedAt: 50 } }],
        deleted: { players: [], trainings: [], scores: [{ trainingId: 't1', matchId: 'm2' }], solo: [{ trainingId: 't1', playerId: 'a', key: 'x@1' }], playTimes: [{ trainingId: 't1', itemId: 'm2' }] },
      }),
      none,
    );
    const t1 = out.trainings[0];
    expect(t1.scores).toEqual({ m1: { ga: 4, gb: 0 }, m3: { ga: 0, gb: 1 } });
    expect(t1.soloResults).toEqual({ a: { chain: 9 }, b: { chain: 1 } });
    expect(t1.soloAttempts).toEqual({ a: { chain: 12 } });
    expect(t1.playTimes).toEqual({ m1: { startedAt: 10, endedAt: 50 } });
    expect(out.trainings[1]).toBe(local.trainings[1]); // nedotčený trénink zůstává týž objekt
  });

  it('řádek smazaný a znovu zapsaný platí (zápis má přednost před záznamem o smazání)', () => {
    const local: AppData = { players: [], trainings: [t({ scores: { m1: { ga: 1, gb: 0 } } })] };
    const out = applyChanges(local, ch({ scores: [{ trainingId: 't1', matchId: 'm1', score: { ga: 2, gb: 0 } }], deleted: { players: [], trainings: [], scores: [{ trainingId: 't1', matchId: 'm1' }], solo: [], playTimes: [] } }), none);
    expect(out.trainings[0].scores).toEqual({ m1: { ga: 2, gb: 0 } });
  });

  it('změněná konfigurace tréninku nechá jeho skóre, výsledky, časy a průběh; nový trénink přibude se svými řádky; smazaný zmizí', () => {
    const e = { id: 'e1', itemId: 'm1', at: 1, kind: 'goal' as const, side: 'A' as const, delta: 1 as const };
    const local: AppData = { players: [], trainings: [t({ scores: { m1: { ga: 1, gb: 0 } }, soloResults: { a: { chain: 2 } }, playTimes: { m1: { startedAt: 1 } }, events: [e] }), t({ id: 'gone' })] };
    const out = applyChanges(
      local,
      ch({
        trainings: [t({ tables: 3 }), t({ id: 'new' })],
        scores: [{ trainingId: 'new', matchId: 'm9', score: { ga: 6, gb: 2 } }],
        deleted: { players: [], trainings: ['gone'], scores: [], solo: [], playTimes: [] },
      }),
      none,
    );
    expect(out.trainings.map((x) => x.id)).toEqual(['t1', 'new']);
    expect(out.trainings[0]).toMatchObject({ tables: 3, scores: { m1: { ga: 1, gb: 0 } }, soloResults: { a: { chain: 2 } }, playTimes: { m1: { startedAt: 1 } }, events: [e] });
    expect(out.trainings[1].scores).toEqual({ m9: { ga: 6, gb: 2 } });
  });

  it('hráči a katalog: změnění se přepíšou, smazaní zmizí, noví přibudou', () => {
    const local: AppData = { players: [p('a'), p('b')], trainings: [], catalog: { skills: [] } };
    const out = applyChanges(local, ch({ players: [p('a', 'Adam'), p('c')], catalog: {}, deleted: { players: ['b'], trainings: [], scores: [], solo: [], playTimes: [] } }), none);
    expect(out.players).toEqual([p('a', 'Adam'), p('c')]);
    expect(out.catalog).toEqual({});
    expect(applyChanges(local, ch(), none).catalog).toEqual({ skills: [] });
  });

  it('vlastní čekající zápis si ponechá lokální hodnotu (skóre, výsledek, čas, konfigurace, smazání, hráči, katalog)', () => {
    const local: AppData = {
      players: [p('a')],
      trainings: [t({ tables: 2, scores: { m1: { ga: 5, gb: 0 } }, soloResults: { a: { chain: 7 } }, playTimes: { m1: { startedAt: 1 } } }), t({ id: 'mine' })],
      catalog: { skills: [] },
    };
    const busy = (k: string) => ['t1::m1', 't1::solo::a::chain', 't1::time::m1', 't1::training', 'mine::training', 'players', 'catalog'].includes(k);
    const out = applyChanges(
      local,
      ch({
        players: [p('a', 'Adam')],
        catalog: {},
        trainings: [t({ tables: 4, lockedRounds: lr(2) })],
        scores: [{ trainingId: 't1', matchId: 'm1', score: { ga: 1, gb: 0 } }],
        solo: [{ trainingId: 't1', playerId: 'a', key: 'chain', value: 1, attempts: null }],
        playTimes: [{ trainingId: 't1', itemId: 'm1', time: { startedAt: 1, endedAt: 2 } }],
        deleted: { players: [], trainings: ['mine'], scores: [], solo: [], playTimes: [] },
      }),
      busy,
    );
    expect(out.players).toEqual([p('a')]);
    expect(out.catalog).toEqual({ skills: [] });
    expect(out.trainings.map((x) => x.id)).toEqual(['t1', 'mine']);
    expect(out.trainings[0]).toMatchObject({ tables: 2, scores: { m1: { ga: 5, gb: 0 } }, soloResults: { a: { chain: 7 } }, playTimes: { m1: { startedAt: 1 } } });
    expect(out.trainings[0].lockedRounds).toHaveLength(2); // delší zamčení kol se převezme vždy
  });

  it('řádky tréninku, který zařízení nezná, se zahodí', () => {
    const local: AppData = { players: [], trainings: [t()] };
    expect(applyChanges(local, ch({ scores: [{ trainingId: 'neznamy', matchId: 'm1', score: { ga: 1, gb: 0 } }] }), none)).toEqual(local);
  });
});
