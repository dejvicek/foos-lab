import { act, renderHook, waitFor } from '@testing-library/react';
import { useAppState } from './useAppState';
import { memoryRepository } from '../storage/memoryRepository';
import { memorySnapshot } from '../storage/snapshot';
import type { Match, Training } from '../domain/types';
import type { Changes, Repository } from '../storage/repository';

const t: Training = { id: 't1', date: '2026-11-10', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan: {}, lockedRounds: [], mode: 'team', tables: 2, attendees: [], scores: {} };
const m: Match = { id: 'league|1|1|a+bvc+d', block: 'league', round: 1, table: 1, kind: 'doubles', sideA: ['a', 'b'], sideB: ['c', 'd'] };
const saved = (training: Training, cursor: string | null = null) => ({ data: { players: [], trainings: [training] }, cursor, savedAt: 1 });
const idle = (ms = 40) => act(() => new Promise((r) => setTimeout(r, ms)));
const opts = { loadWaitMs: 30, snapshotDelayMs: 10 };

describe('useAppState – poslední stav uložený v zařízení', () => {
  it('s uloženým stavem je appka připravená hned, ještě před odpovědí serveru', async () => {
    const repo = memoryRepository({ players: [], trainings: [{ ...t, tables: 4 }] });
    repo.hold(); // pomalé spojení: server zatím neodpověděl
    const snapshot = memorySnapshot(saved({ ...t, tables: 3 }));
    const { result } = renderHook(() => useAppState(repo, { ...opts, snapshot }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data.trainings[0].tables).toBe(3);
    await act(async () => repo.release());
    await waitFor(() => expect(result.current.data.trainings[0].tables).toBe(4));
  });

  it('bez spojení zůstává uložený stav na obrazovce (žádná chybová obrazovka)', async () => {
    const repo = memoryRepository({ players: [], trainings: [] }, { failLoad: true });
    const snapshot = memorySnapshot(saved(t));
    const { result } = renderHook(() => useAppState(repo, { ...opts, snapshot }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await idle(80);
    expect(result.current.status).toBe('ready');
    expect(result.current.data.trainings).toHaveLength(1);
  });

  it('bez uloženého stavu a bez spojení ukáže chybu načtení jako dřív', async () => {
    const repo = memoryRepository({ players: [], trainings: [] }, { failLoad: true });
    const snapshot = memorySnapshot();
    const { result } = renderHook(() => useAppState(repo, { ...opts, snapshot }));
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('po načtení ze serveru a po každé změně se stav uloží – bez průběhu her', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] });
    const snapshot = memorySnapshot();
    const { result } = renderHook(() => useAppState(repo, { ...opts, snapshot }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(async () => expect((await snapshot.load())?.data.trainings).toHaveLength(1));
    act(() => result.current.bumpScore('t1', m, 'ga', 1));
    await waitFor(async () => expect((await snapshot.load())?.data.trainings[0].scores[m.id]).toEqual({ ga: 1, gb: 0 }));
    const snap = await snapshot.load();
    expect(snap?.data.trainings[0].events).toBeUndefined();
    expect(result.current.data.trainings[0].events).toHaveLength(1);
  });

  it('před prvním načtením se nic neukládá (prázdný stav nepřepíše uložený)', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] });
    repo.hold();
    const snapshot = memorySnapshot();
    renderHook(() => useAppState(repo, { ...opts, snapshot }));
    await idle(80);
    expect(await snapshot.load()).toBeNull();
  });

  it('uložený kurzor: po startu se ze serveru ptá jen na změny', async () => {
    const base = memoryRepository({ players: [], trainings: [t] });
    const asked: string[] = [];
    const none: Changes = { cursor: 'c2', players: [], trainings: [], scores: [{ trainingId: 't1', matchId: m.id, score: { ga: 2, gb: 0 } }], solo: [], playTimes: [], deleted: { players: [], trainings: [], scores: [], solo: [], playTimes: [] } };
    const repo: Repository = { ...base, loadChanges: async (c) => (asked.push(c), { changes: none }) };
    const snapshot = memorySnapshot(saved(t, 'c1'));
    const { result } = renderHook(() => useAppState(repo, { ...opts, snapshot }));
    await waitFor(() => expect(result.current.data.trainings[0]?.scores[m.id]).toEqual({ ga: 2, gb: 0 }));
    expect(asked).toEqual(['c1']);
    expect(base.loads()).toBe(0);
    await waitFor(async () => expect((await snapshot.load())?.cursor).toBe('c2'));
  });

  it('když server odpoví dřív než úložiště v zařízení, starší uložený stav ho nepřepíše', async () => {
    const repo = memoryRepository({ players: [], trainings: [{ ...t, tables: 4 }] });
    let release = () => {};
    const slow = memorySnapshot(saved({ ...t, tables: 3 }));
    const snapshot = { ...slow, load: () => new Promise<Awaited<ReturnType<typeof slow.load>>>((r) => (release = () => void slow.load().then(r))) };
    const { result } = renderHook(() => useAppState(repo, { ...opts, snapshot }));
    await waitFor(() => expect(result.current.data.trainings[0]?.tables).toBe(4));
    await act(async () => release());
    await idle();
    expect(result.current.data.trainings[0].tables).toBe(4);
  });
});
