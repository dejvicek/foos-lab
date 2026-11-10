import { act, renderHook, waitFor } from '@testing-library/react';
import { useAppState } from './useAppState';
import { memoryRepository } from '../storage/memoryRepository';
import type { Match, Training } from '../domain/types';

const t: Training = { id: 't1', date: '2026-11-10', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan: {}, lockedRounds: [], mode: 'team', tables: 2, attendees: [], scores: {} };
const m: Match = { id: 'league|1|1|a+bvc+d', block: 'league', round: 1, table: 1, kind: 'doubles', sideA: ['a', 'b'], sideB: ['c', 'd'] };

async function setup(opts: Parameters<typeof memoryRepository>[1]) {
  const repo = memoryRepository({ players: [], trainings: [t] }, opts);
  const hook = renderHook(() => useAppState(repo));
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return { repo, ...hook };
}

const online = () => act(() => void window.dispatchEvent(new Event('online')));

describe('useAppState – pomalé a vypadávající spojení', () => {
  it('po obnovení spojení se čekající zápis zopakuje hned, ne až po prodlevě', async () => {
    const { repo, result } = await setup({ failSaves: 1 });
    act(() => result.current.savePlayer({ id: 'a', name: 'Honza', archived: false, order: 0 }));
    await waitFor(() => expect(result.current.saveState).toBe('retrying'));
    online();
    await waitFor(() => expect(result.current.saveState).toBe('idle'), { timeout: 500 });
    expect(repo.snapshot().players.map((p) => p.name)).toEqual(['Honza']);
  });

  it('ťuknutí, u kterého se ztratila odpověď serveru, se při opakování nezapočítá podruhé', async () => {
    const { repo, result } = await setup({ loseResponses: 1 });
    act(() => result.current.bumpScore('t1', m, 'ga', 1));
    await waitFor(() => expect(result.current.saveState).toBe('retrying'));
    online();
    await waitFor(() => expect(result.current.saveState).toBe('idle'));
    expect(repo.snapshot().trainings[0].scores[m.id]).toEqual({ ga: 1, gb: 0 });
    expect(result.current.data.trainings[0].scores[m.id]).toEqual({ ga: 1, gb: 0 });
  });

  it('ťuknutí zapíše skóre i událost průběhu hry jedním zápisem', async () => {
    const { repo, result } = await setup({});
    act(() => result.current.bumpScore('t1', m, 'lb', 1));
    const local = result.current.data.trainings[0].events;
    expect(local).toHaveLength(1);
    expect(local?.[0]).toMatchObject({ itemId: m.id, kind: 'loss', side: 'B', delta: 1 });
    await waitFor(() => expect(repo.snapshot().trainings[0].events).toEqual(local));
    expect(repo.snapshot().trainings[0].scores[m.id]).toEqual({ la: 0, lb: 1 });
  });

  it('ťuknutí, které nic nezmění (strop, nula), se neposílá a nenechá událost', async () => {
    const { repo, result } = await setup({});
    act(() => result.current.bumpScore('t1', m, 'ga', -1));
    for (let i = 0; i < 8; i++) act(() => result.current.bumpScore('t1', m, 'gb', 1));
    expect(result.current.data.trainings[0].events).toHaveLength(6);
    await waitFor(() => expect(result.current.saveState).toBe('idle'));
    expect(repo.snapshot().trainings[0].events).toHaveLength(6);
    expect(repo.snapshot().trainings[0].scores[m.id]).toEqual({ ga: 0, gb: 6 });
  });

  it('opožděné Zahájit znovu neotevře utkání, které mezitím dohrál jiný telefon', async () => {
    const { repo, result } = await setup({ failSaves: 1 });
    act(() => result.current.startItem('t1', m.id));
    expect(result.current.data.trainings[0].playTimes?.[m.id].startedAt).toBeTypeOf('number');
    await waitFor(() => expect(result.current.saveState).toBe('retrying'));
    await repo.endItem('t1', m.id, 1000, 2000); // jiný telefon mezitím utkání zahájil a dohrál
    online();
    await waitFor(() => expect(result.current.saveState).toBe('idle'));
    expect(repo.snapshot().trainings[0].playTimes).toEqual({ [m.id]: { startedAt: 1000, endedAt: 2000 } });
  });

  it('endItem doplní zahájení nezahájenému utkání a konec nepřepíše', async () => {
    const { repo, result } = await setup({});
    act(() => result.current.endItem('t1', m.id, { startedAt: 500, endedAt: 900 }));
    expect(result.current.data.trainings[0].playTimes).toEqual({ [m.id]: { startedAt: 500, endedAt: 900 } });
    act(() => result.current.endItem('t1', m.id, { endedAt: 1200 }));
    expect(result.current.data.trainings[0].playTimes).toEqual({ [m.id]: { startedAt: 500, endedAt: 900 } });
    await waitFor(() => expect(result.current.saveState).toBe('idle'));
    expect(repo.snapshot().trainings[0].playTimes).toEqual({ [m.id]: { startedAt: 500, endedAt: 900 } });
  });
});
