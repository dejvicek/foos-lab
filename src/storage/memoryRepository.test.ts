import { memoryRepository } from './memoryRepository';
import type { Training } from '../domain/types';

const t: Training = { id: 't1', date: '2026-10-31', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, mode: 'team', tables: 4, attendees: [], scores: {} };

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
