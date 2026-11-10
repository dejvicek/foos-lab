import { memoryRepository } from './memoryRepository';
import type { Training } from '../domain/types';

const t: Training = { id: 't1', date: '2026-10-31', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'classic', durationMin: 180, plan: {}, lockedRounds: [], mode: 'team', tables: 4, attendees: [], scores: {} };

describe('memoryRepository', () => {
  it('uloží a načte hráče', async () => {
    const repo = memoryRepository();
    await repo.savePlayer({ id: 'a', name: 'A', archived: false, order: 0 });
    expect((await repo.loadAll()).players).toEqual([{ id: 'a', name: 'A', archived: false, order: 0 }]);
  });

  it('saveTraining nemění skóre; saveScore s prázdným skóre řádek smaže', async () => {
    const repo = memoryRepository();
    await repo.saveTraining(t);
    await repo.saveScore('t1', 'm1', { ga: 6, gb: 1 });
    await repo.saveTraining({ ...t, scores: {} });
    expect((await repo.loadAll()).trainings[0].scores).toEqual({ m1: { ga: 6, gb: 1 } });
    await repo.saveScore('t1', 'm1', { ga: null, gb: null });
    expect((await repo.loadAll()).trainings[0].scores).toEqual({});
  });

  it('replaceScores nechá jen vyjmenované zápasy', async () => {
    const repo = memoryRepository();
    await repo.saveTraining(t);
    await repo.saveScore('t1', 'a', { ga: 1 });
    await repo.saveScore('t1', 'b', { ga: 2 });
    await repo.replaceScores('t1', ['a']);
    expect(repo.snapshot().trainings[0].scores).toEqual({ a: { ga: 1 } });
  });

  it('saveSolo uloží a null smaže; replaceSolo nechá jen vyjmenované', async () => {
    const repo = memoryRepository();
    await repo.saveTraining(t);
    await repo.saveSolo('t1', 'a', 'fiveBarControl', 2);
    await repo.saveSolo('t1', 'a', 'setShooting', 11);
    await repo.saveSolo('t1', 'b', 'chain', 4);
    await repo.saveSolo('t1', 'a', 'setShooting', null);
    expect(repo.snapshot().trainings[0].soloResults).toEqual({ a: { fiveBarControl: 2 }, b: { chain: 4 } });
    await repo.replaceSolo('t1', [{ playerId: 'a', metric: 'fiveBarControl', key: 'fiveBarControl' }]);
    expect(repo.snapshot().trainings[0].soloResults).toEqual({ a: { fiveBarControl: 2 } });
  });

  it('saveTraining nemění výsledky sólové části', async () => {
    const repo = memoryRepository();
    await repo.saveTraining(t);
    await repo.saveSolo('t1', 'a', 'chain', 4);
    await repo.saveTraining({ ...t, startTime: '17:00' });
    expect(repo.snapshot().trainings[0]).toMatchObject({ startTime: '17:00', soloResults: { a: { chain: 4 } } });
  });

  it('deleteTraining smaže i skóre', async () => {
    const repo = memoryRepository();
    await repo.saveTraining(t);
    await repo.saveScore('t1', 'a', { ga: 1 });
    await repo.deleteTraining('t1');
    expect(repo.snapshot().trainings).toEqual([]);
  });

  it('vrací kopie, ne sdílené objekty', async () => {
    const repo = memoryRepository({ players: [{ id: 'a', name: 'A', archived: false, order: 0 }], trainings: [] });
    const data = await repo.loadAll();
    data.players[0].name = 'změna';
    expect(repo.snapshot().players[0].name).toBe('A');
  });

  it('failLoad a failSaves simulují výpadek', async () => {
    await expect(memoryRepository(undefined, { failLoad: true }).loadAll()).rejects.toThrow();
    const repo = memoryRepository(undefined, { failSaves: 1 });
    await expect(repo.savePlayer({ id: 'a', name: 'A', archived: false, order: 0 })).rejects.toThrow();
    await expect(repo.savePlayer({ id: 'a', name: 'A', archived: false, order: 0 })).resolves.toBeUndefined();
    expect(repo.snapshot().players).toHaveLength(1);
  });
});

describe('memoryRepository – zápisy, které jde opakovat', () => {
  const goal = (id: string, field: 'ga' | 'gb' | 'la' | 'lb' = 'ga', delta = 1, max = 6) => ({ id, at: 1000, field, delta, max });

  it('tapScore přičte, soupeři doplní 0, zapíše událost a vrátí výsledný stav', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] });
    expect(await repo.tapScore('t1', 'm1', [goal('e1')])).toEqual({ ga: 1, gb: 0 });
    expect(repo.snapshot().trainings[0].events).toEqual([{ id: 'e1', itemId: 'm1', at: 1000, kind: 'goal', side: 'A', delta: 1 }]);
  });

  it('tapScore se stejným ID se podruhé nezapočítá (opakovaný zápis po chybě sítě)', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] });
    await repo.tapScore('t1', 'm1', [goal('e1')]);
    expect(await repo.tapScore('t1', 'm1', [goal('e1')])).toEqual({ ga: 1, gb: 0 });
    expect(repo.snapshot().trainings[0].events).toHaveLength(1);
  });

  it('tapScore: víc ťuknutí najednou (ztráta + gól soupeře), strop a nula', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] });
    expect(await repo.tapScore('t1', 'm1', [goal('e1', 'lb', 1, 30), goal('e2', 'ga')])).toEqual({ ga: 1, gb: 0, la: 0, lb: 1 });
    expect(await repo.tapScore('t1', 'm1', [goal('e3', 'gb', 1, 1), goal('e4', 'gb', 1, 1), goal('e5', 'la', -1, 30)])).toEqual({ ga: 1, gb: 1, la: 0, lb: 1 });
    expect(repo.snapshot().trainings[0].events?.find((e) => e.id === 'e1')).toMatchObject({ kind: 'loss', side: 'B' });
  });

  it('tapDrill přičte pokus i výsledek, opakování se nezapočítá, přes plný počet nepustí', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] });
    const hit = (id: string, delta: 1 | -1 = 1) => ({ id, at: 1000, itemId: 'drill|x', ok: true, delta, dValue: delta, dAttempts: delta });
    const miss = (id: string) => ({ id, at: 1000, itemId: 'drill|x', ok: false, delta: 1 as const, dValue: 0, dAttempts: 1 });
    expect(await repo.tapDrill('t1', 'p1', 'penaltySolo@1', 3, [hit('d1')])).toEqual({ value: 1, attempts: 1 });
    expect(await repo.tapDrill('t1', 'p1', 'penaltySolo@1', 3, [hit('d1')])).toEqual({ value: 1, attempts: 1 });
    expect(await repo.tapDrill('t1', 'p1', 'penaltySolo@1', 3, [miss('d2'), hit('d3'), hit('d4')])).toEqual({ value: 2, attempts: 3 });
    expect(repo.snapshot().trainings[0].events?.map((e) => e.id)).toEqual(['d1', 'd2', 'd3']);
    expect(repo.snapshot().trainings[0].events?.[1]).toEqual({ id: 'd2', itemId: 'drill|x', at: 1000, kind: 'miss', playerId: 'p1', delta: 1 });
    expect(await repo.tapDrill('t1', 'p1', 'penaltySolo@1', 3, [hit('d5', -1)])).toEqual({ value: 1, attempts: 2 });
  });

  it('startItem / endItem zapíšou čas, jen když ještě není', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] });
    expect(await repo.startItem('t1', 'm1', 1000)).toEqual({ startedAt: 1000 });
    expect(await repo.startItem('t1', 'm1', 1500)).toEqual({ startedAt: 1000 });
    expect(await repo.endItem('t1', 'm1', undefined, 2000)).toEqual({ startedAt: 1000, endedAt: 2000 });
    // Opožděné zahájení dohrané utkání znovu neotevře; druhý konec čas nezmění.
    expect(await repo.startItem('t1', 'm1', 2500)).toEqual({ startedAt: 1000, endedAt: 2000 });
    expect(await repo.endItem('t1', 'm1', undefined, 3000)).toEqual({ startedAt: 1000, endedAt: 2000 });
    // Konec nezahájeného utkání doplní zahájení; pauza spuštěná bez zahájení ho nemá.
    expect(await repo.endItem('t1', 'm2', 4000, 5000)).toEqual({ startedAt: 4000, endedAt: 5000 });
    expect(await repo.endItem('t1', 'pause|0', undefined, 6000)).toEqual({ endedAt: 6000 });
  });

  it('loseResponses: zápis proběhne, ale skončí chybou sítě', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] }, { loseResponses: 1 });
    await expect(repo.tapScore('t1', 'm1', [goal('e1')])).rejects.toThrow();
    expect(repo.snapshot().trainings[0].scores).toEqual({ m1: { ga: 1, gb: 0 } });
  });
});

describe('memoryRepository – načítání po částech', () => {
  const goal = { id: 'e1', at: 1000, field: 'ga' as const, delta: 1, max: 6 };

  it('loadAll průběh her nenačítá; loadEvents ho vrátí pro jeden trénink; loadBackup vrací všechno', async () => {
    const repo = memoryRepository({ players: [], trainings: [t, { ...t, id: 't2', scores: {} }] });
    await repo.tapScore('t1', 'm1', [goal]);
    await repo.tapScore('t2', 'm1', [{ ...goal, id: 'e2' }]);
    const all = await repo.loadAll();
    expect(all.trainings.map((x) => x.events)).toEqual([undefined, undefined]);
    expect(all.trainings[0].scores).toEqual({ m1: { ga: 1, gb: 0 } });
    expect((await repo.loadEvents('t1')).map((e) => e.id)).toEqual(['e1']);
    expect(await repo.loadEvents('neexistuje')).toEqual([]);
    expect((await repo.loadBackup()).trainings.map((x) => x.events?.map((e) => e.id))).toEqual([['e1'], ['e2']]);
  });

  it('po přihlášení k odběru ohlásí připojení (jako Realtime) a počítá načtení', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] });
    let joined = 0;
    const off = repo.subscribe({ score() {}, solo() {}, training() {}, playTime() {}, event() {}, resync: () => joined++ });
    await Promise.resolve();
    expect(joined).toBe(1);
    off();
    expect(repo.loads()).toBe(0);
    await repo.loadAll();
    expect(repo.loads()).toBe(1);
  });

  it('hold / release: načtení vezme stav hned, ale vrátí ho až po uvolnění', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] });
    repo.hold();
    let done = false;
    const p = repo.loadAll().then((d) => {
      done = true;
      return d;
    });
    await repo.saveScore('t1', 'm1', { ga: 3, gb: 0 }); // zápis po pořízení snímku
    await Promise.resolve();
    expect(done).toBe(false);
    repo.release();
    expect((await p).trainings[0].scores).toEqual({});
  });
});
