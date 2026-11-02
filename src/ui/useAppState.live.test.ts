import { act, renderHook, waitFor } from '@testing-library/react';
import { useAppState } from './useAppState';
import { memoryRepository } from '../storage/memoryRepository';
import type { Match, Training } from '../domain/types';

const t: Training = { id: 't1', date: '2026-11-02', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan: {}, lockedRounds: [], mode: 'team', tables: 2, attendees: [], scores: {} };
const m: Match = { id: 'league|1|1|a+bvc+d', block: 'league', round: 1, table: 1, kind: 'doubles', sideA: ['a', 'b'], sideB: ['c', 'd'] };

async function setup(training: Training = t) {
  const repo = memoryRepository({ players: [], trainings: [training] });
  const hook = renderHook(() => useAppState(repo));
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return { repo, ...hook };
}

describe('useAppState – ťukání', () => {
  it('bumpScore se hned projeví a uloží se jako přičtení', async () => {
    const { repo, result } = await setup();
    act(() => result.current.bumpScore('t1', m, 'ga', 1));
    act(() => result.current.bumpScore('t1', m, 'ga', 1));
    act(() => result.current.bumpScore('t1', m, 'lb', 1));
    expect(result.current.data.trainings[0].scores[m.id]).toEqual({ ga: 2, gb: 0, la: 0, lb: 1 });
    await waitFor(() => expect(repo.snapshot().trainings[0].scores[m.id]).toEqual({ ga: 2, gb: 0, la: 0, lb: 1 }));
  });

  it('bumpScore nejde pod nulu ani přes strop legu', async () => {
    const { result } = await setup();
    act(() => result.current.bumpScore('t1', m, 'gb', -1));
    expect(result.current.data.trainings[0].scores[m.id]?.gb ?? 0).toBe(0);
    for (let i = 0; i < 15; i++) act(() => result.current.bumpScore('t1', m, 'ga', 1));
    expect(result.current.data.trainings[0].scores[m.id]?.ga).toBe(10);
  });

  it('bumpSolo přičítá v mezích 0…max', async () => {
    const { repo, result } = await setup();
    act(() => result.current.bumpSolo('t1', 'p1', 'chain', 1, 2));
    act(() => result.current.bumpSolo('t1', 'p1', 'chain', 1, 2));
    act(() => result.current.bumpSolo('t1', 'p1', 'chain', 1, 2));
    expect(result.current.data.trainings[0].soloResults).toEqual({ p1: { chain: 2 } });
    await waitFor(() => expect(repo.snapshot().trainings[0].soloResults).toEqual({ p1: { chain: 2 } }));
  });
});

describe('useAppState – živé změny', () => {
  it('skóre a výsledky od jiného telefonu se doplní do stavu', async () => {
    const { repo, result } = await setup();
    act(() => repo.emit().score('t1', m.id, { ga: 3, gb: 1 }));
    act(() => repo.emit().solo('t1', 'p1', 'chain', 4));
    expect(result.current.data.trainings[0].scores[m.id]).toEqual({ ga: 3, gb: 1 });
    expect(result.current.data.trainings[0].soloResults).toEqual({ p1: { chain: 4 } });
    act(() => repo.emit().score('t1', m.id, null));
    expect(result.current.data.trainings[0].scores[m.id]).toBeUndefined();
  });

  it('změna tréninku zachová skóre, nový trénink přibude, smazaný zmizí', async () => {
    const { repo, result } = await setup({ ...t, scores: { [m.id]: { ga: 1 } } });
    act(() => repo.emit().training({ ...t, tables: 3, scores: {} }, 't1'));
    expect(result.current.data.trainings[0].tables).toBe(3);
    expect(result.current.data.trainings[0].scores[m.id]).toEqual({ ga: 1 });
    act(() => repo.emit().training({ ...t, id: 't2' }, 't2'));
    expect(result.current.data.trainings.map((x) => x.id)).toEqual(['t1', 't2']);
    act(() => repo.emit().training(null, 't1'));
    expect(result.current.data.trainings.map((x) => x.id)).toEqual(['t2']);
  });

  it('po odpojení komponenty se odběr zruší', async () => {
    const { repo, unmount } = await setup();
    expect(repo.subscribers()).toBe(1);
    unmount();
    expect(repo.subscribers()).toBe(0);
  });
});
