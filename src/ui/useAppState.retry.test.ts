import { act, renderHook, waitFor } from '@testing-library/react';
import { useAppState } from './useAppState';
import { memoryRepository } from '../storage/memoryRepository';
import { memoryOutbox, OUTBOX_MAX_AGE_MS } from '../storage/outbox';
import { soloMetric } from '../domain/solo';
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

  it('ťuknutí, které server odmítl, zmizí ze skóre i z průběhu hry', async () => {
    const { result } = await setup({ failPermanent: 1 });
    act(() => result.current.bumpScore('t1', m, 'ga', 1));
    await waitFor(() => expect(result.current.saveError).toMatch(/nepodařilo uložit/));
    await waitFor(() => expect(result.current.data.trainings[0].scores[m.id]).toBeUndefined());
    expect(result.current.data.trainings[0].events ?? []).toEqual([]);
  });
});

describe('useAppState – po uložení platí stav ze serveru', () => {
  it('skóre: převezme se i ťuknutí jiného telefonu, jehož živá změna nedorazila', async () => {
    const { repo, result } = await setup({});
    await repo.tapScore('t1', m.id, [{ id: 'cizi', at: 1, field: 'gb', delta: 1, max: 6 }]);
    act(() => result.current.bumpScore('t1', m, 'ga', 1));
    expect(result.current.data.trainings[0].scores[m.id]).toEqual({ ga: 1, gb: 0 });
    await waitFor(() => expect(result.current.data.trainings[0].scores[m.id]).toEqual({ ga: 1, gb: 1 }));
  });

  it('skóre: dokud čekají další vlastní ťuknutí, stav ze serveru je nepřepíše', async () => {
    const { repo, result } = await setup({});
    act(() => result.current.bumpScore('t1', m, 'ga', 1));
    act(() => result.current.bumpScore('t1', m, 'ga', 1));
    act(() => result.current.bumpScore('t1', m, 'ga', 1));
    expect(result.current.data.trainings[0].scores[m.id]?.ga).toBe(3);
    await waitFor(() => expect(result.current.saveState).toBe('idle'));
    expect(result.current.data.trainings[0].scores[m.id]).toEqual({ ga: 3, gb: 0 });
    expect(repo.snapshot().trainings[0].scores[m.id]).toEqual({ ga: 3, gb: 0 });
  });

  it('cvičení: převezme se výsledek ze serveru (pokus jiného telefonu)', async () => {
    const { repo, result } = await setup({});
    const def = soloMetric('warmupPasses');
    await repo.tapDrill('t1', 'p1', 'warmupPasses@1', def.max, [{ id: 'cizi', at: 1, itemId: 'drill|x', ok: true, delta: 1, dValue: 1, dAttempts: 1 }]);
    act(() => result.current.tapSolo('t1', 'p1', 'warmupPasses@1', def, true, 1, 'drill|x'));
    await waitFor(() => expect(result.current.data.trainings[0].soloResults).toEqual({ p1: { 'warmupPasses@1': 2 } }));
    expect(result.current.data.trainings[0].soloAttempts).toEqual({ p1: { 'warmupPasses@1': 2 } });
  });

  it('časy: opožděné Zahájit převezme časy utkání, které mezitím dohrál jiný telefon', async () => {
    const { repo, result } = await setup({ failSaves: 1 });
    act(() => result.current.startItem('t1', m.id));
    await waitFor(() => expect(result.current.saveState).toBe('retrying'));
    await repo.endItem('t1', m.id, 1000, 2000);
    online();
    await waitFor(() => expect(result.current.data.trainings[0].playTimes).toEqual({ [m.id]: { startedAt: 1000, endedAt: 2000 } }));
  });
});

describe('useAppState – fronta zápisů přežije zavření appky', () => {
  it('neodeslaná ťuknutí se po novém spuštění odešlou a fronta v zařízení se vyprázdní', async () => {
    const outbox = memoryOutbox();
    const repo = memoryRepository({ players: [], trainings: [t] }, { failSaves: 1 });
    const first = renderHook(() => useAppState(repo, { outbox }));
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    act(() => first.result.current.bumpScore('t1', m, 'ga', 1));
    await waitFor(() => expect(first.result.current.saveState).toBe('retrying'));
    expect(outbox.load()).toHaveLength(1);
    first.unmount(); // telefon appku zavřel dřív, než se zápis povedl

    const second = renderHook(() => useAppState(repo, { outbox }));
    await waitFor(() => expect(repo.snapshot().trainings[0].scores[m.id]).toEqual({ ga: 1, gb: 0 }));
    await waitFor(() => expect(second.result.current.data.trainings[0]?.scores[m.id]).toEqual({ ga: 1, gb: 0 }));
    expect(outbox.load()).toEqual([]);
    expect(repo.snapshot().trainings[0].events).toHaveLength(1);
  });

  it('zápisy starší než den se po spuštění neodešlou a appka to oznámí', async () => {
    const old = Date.now() - OUTBOX_MAX_AGE_MS - 1000;
    const outbox = memoryOutbox([{ at: old, op: { kind: 'tapScore', trainingId: 't1', matchId: m.id, taps: [{ id: 'e1', at: old, field: 'ga', delta: 1, max: 6 }] } }]);
    const repo = memoryRepository({ players: [], trainings: [t] });
    const { result } = renderHook(() => useAppState(repo, { outbox }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.saveError).toMatch(/starší než den/);
    expect(repo.snapshot().trainings[0].scores).toEqual({});
    expect(outbox.load()).toEqual([]);
  });

  it('série ťuknutí čekající ve frontě odejde jedním zápisem', async () => {
    const { repo, result } = await setup({ failSaves: 1 });
    act(() => result.current.bumpScore('t1', m, 'ga', 1));
    act(() => result.current.bumpScore('t1', m, 'ga', 1));
    act(() => result.current.bumpScore('t1', m, 'lb', 1));
    await waitFor(() => expect(result.current.saveState).toBe('retrying'));
    online();
    await waitFor(() => expect(result.current.saveState).toBe('idle'));
    expect(repo.snapshot().trainings[0].scores[m.id]).toEqual({ ga: 2, gb: 0, la: 0, lb: 1 });
    expect(repo.writes()).toBe(2); // nepovedený první pokus + jedna dávka
  });
});
