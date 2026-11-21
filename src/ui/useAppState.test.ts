import { act, renderHook, waitFor } from '@testing-library/react';
import { useAppState } from './useAppState';
import { memoryRepository } from '../storage/memoryRepository';
import type { Training } from '../domain/types';

const t: Training = { id: 't1', date: '2026-10-31', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'classic', durationMin: 180, plan: {}, lockedRounds: [], mode: 'team', tables: 4, attendees: [], scores: {} };

describe('useAppState', () => {
  it('smazání tréninku zruší čekající zápis skóre (žádné nekonečné opakování)', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] });
    const { result } = renderHook(() => useAppState(repo));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.saveScore('t1', 'm1', { ga: 6, gb: 1 }));
    act(() => result.current.deleteTraining('t1'));
    await new Promise((r) => setTimeout(r, 600));
    expect(result.current.saveState).toBe('idle');
    expect(repo.snapshot().trainings).toEqual([]);
  });

  it('vymazání skóre zruší čekající zápis, skóre se nevrátí', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] });
    const { result } = renderHook(() => useAppState(repo));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.saveScore('t1', 'm1', { ga: 6, gb: 1 }));
    act(() => result.current.updateTrainingConfig({ ...t, scores: {} }));
    await new Promise((r) => setTimeout(r, 600));
    expect(repo.snapshot().trainings[0].scores).toEqual({});
    expect(result.current.data.trainings[0].scores).toEqual({});
  });
});

describe('useAppState – sólová část', () => {
  it('saveSolo se uloží s odstupem; smazání tréninku čekající zápis zruší', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] });
    const { result } = renderHook(() => useAppState(repo));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.saveSolo('t1', 'p1', 'chain', 4));
    expect(result.current.data.trainings[0].soloResults).toEqual({ p1: { chain: 4 } });
    await waitFor(() => expect(repo.snapshot().trainings[0].soloResults).toEqual({ p1: { chain: 4 } }));

    act(() => result.current.saveSolo('t1', 'p1', 'chain', 5));
    act(() => result.current.deleteTraining('t1'));
    await new Promise((r) => setTimeout(r, 600));
    expect(result.current.saveState).toBe('idle');
  });

  it('updateTrainingConfig smaže v úložišti výsledky, které v tréninku nejsou', async () => {
    const repo = memoryRepository({ players: [], trainings: [{ ...t, soloResults: { p1: { chain: 4 }, p2: { chain: 1 } } }] });
    const { result } = renderHook(() => useAppState(repo));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.updateTrainingConfig({ ...t, soloResults: { p1: { chain: 4 } } }));
    await waitFor(() => expect(repo.snapshot().trainings[0].soloResults).toEqual({ p1: { chain: 4 } }));
  });
});

describe('useAppState – profilová fotka', () => {
  const honza = { id: 'p1', name: 'Honza', archived: false, order: 0 };
  const img = 'data:image/webp;base64,AA==';

  it('fotka je hned na obrazovce a uloží se; admin pak hráče přejmenuje a fotka zůstane', async () => {
    const repo = memoryRepository({ players: [honza], trainings: [] });
    const { result } = renderHook(() => useAppState(repo));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.setAvatar('p1', img));
    expect(result.current.data.players[0].avatar).toBe(img);
    await waitFor(() => expect(repo.snapshot().players[0].avatar).toBe(img));

    act(() => result.current.savePlayer({ ...result.current.data.players[0], name: 'Honzík' }));
    await waitFor(() => expect(repo.snapshot().players[0].name).toBe('Honzík'));
    expect(repo.snapshot().players[0].avatar).toBe(img);
    expect(result.current.data.players[0].avatar).toBe(img);

    act(() => result.current.setAvatar('p1', null));
    expect(result.current.data.players[0]).toEqual({ ...honza, name: 'Honzík' });
    await waitFor(() => expect(repo.snapshot().players[0]).toEqual({ ...honza, name: 'Honzík' }));
  });
});
