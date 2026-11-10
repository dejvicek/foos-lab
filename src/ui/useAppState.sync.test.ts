import { act, renderHook, waitFor } from '@testing-library/react';
import { useAppState } from './useAppState';
import { memoryRepository } from '../storage/memoryRepository';
import type { Match, Training } from '../domain/types';
import type { Changes, Repository } from '../storage/repository';

const t: Training = { id: 't1', date: '2026-11-10', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan: {}, lockedRounds: [], mode: 'team', tables: 2, attendees: [], scores: {} };
const m: Match = { id: 'league|1|1|a+bvc+d', block: 'league', round: 1, table: 1, kind: 'doubles', sideA: ['a', 'b'], sideB: ['c', 'd'] };
const goal = (id: string) => ({ id, at: 1000, field: 'ga' as const, delta: 1, max: 6 });

async function setup(opts: Parameters<typeof memoryRepository>[1] = {}, training: Training = t) {
  const repo = memoryRepository({ players: [], trainings: [training] }, opts);
  const hook = renderHook(() => useAppState(repo, { loadWaitMs: 30 }));
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return { repo, ...hook };
}

const visible = () => act(() => void document.dispatchEvent(new Event('visibilitychange')));
const idle = () => act(() => new Promise((r) => setTimeout(r, 20)));

describe('useAppState – načítání a dorovnání', () => {
  it('při startu se data načtou jen jednou – po připojení odběru živých změn', async () => {
    const { repo } = await setup();
    await idle();
    expect(repo.loads()).toBe(1);
  });

  it('když se odběr živých změn nepřipojí, data se načtou i tak', async () => {
    const { repo, result } = await setup({ silentSubscribe: true });
    expect(result.current.data.trainings).toHaveLength(1);
    expect(repo.loads()).toBe(1);
  });

  it('souběžná dorovnání sdílejí jedno načtení', async () => {
    const { repo } = await setup();
    await idle();
    visible();
    visible();
    visible();
    await idle();
    expect(repo.loads()).toBe(2);
  });

  it('změna, která dorazí během načítání, se po načtení neztratí', async () => {
    const { repo, result } = await setup();
    await idle();
    repo.hold();
    visible(); // dorovnání vezme snímek dat…
    await repo.saveScore('t1', m.id, { ga: 3, gb: 1 }); // …pak zapíše jiný telefon
    act(() => repo.emit().score('t1', m.id, { ga: 3, gb: 1 })); // a změna dorazí živě
    expect(result.current.data.trainings[0].scores[m.id]).toEqual({ ga: 3, gb: 1 });
    await act(async () => repo.release()); // starší snímek dorazí až teď
    await idle();
    expect(result.current.data.trainings[0].scores[m.id]).toEqual({ ga: 3, gb: 1 });
  });

  it('nepovedené dorovnání nechá data na obrazovce (chyba je jen u prvního načtení)', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] }, { failLoad: true });
    const { result } = renderHook(() => useAppState(repo, { loadWaitMs: 30 }));
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});

describe('useAppState – průběh her jen u tréninku na obrazovce', () => {
  it('průběh se nenačítá s ostatními daty; načte se, až když je trénink na obrazovce', async () => {
    const repo = memoryRepository({ players: [], trainings: [t] });
    await repo.tapScore('t1', m.id, [goal('e1'), goal('e2')]);
    const { result } = renderHook(() => useAppState(repo, { loadWaitMs: 30 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data.trainings[0].events).toBeUndefined();
    expect(result.current.data.trainings[0].scores[m.id]).toEqual({ ga: 2, gb: 0 });
    let off = () => {};
    act(() => void (off = result.current.watchEvents('t1')));
    await waitFor(() => expect(result.current.data.trainings[0].events?.map((e) => e.id)).toEqual(['e1', 'e2']));
    off();
  });

  it('dorovnání načte průběh sledovaného tréninku znovu a vlastní neuložené události nechá', async () => {
    const { repo, result } = await setup();
    act(() => void result.current.watchEvents('t1'));
    await idle();
    await repo.tapScore('t1', m.id, [goal('cizi')]); // jiný telefon, živá změna se ztratila
    visible();
    await waitFor(() => expect(result.current.data.trainings[0].events?.map((e) => e.id)).toEqual(['cizi']));
    expect(result.current.data.trainings[0].scores[m.id]).toEqual({ ga: 1, gb: 0 });
  });

  it('po skončení sledování se průběh při dorovnání už nenačítá', async () => {
    const { repo, result } = await setup();
    let off = () => {};
    act(() => void (off = result.current.watchEvents('t1')));
    await idle();
    off();
    await repo.tapScore('t1', m.id, [goal('cizi')]);
    visible();
    await idle();
    expect(result.current.data.trainings[0].events).toBeUndefined();
    expect(result.current.data.trainings[0].scores[m.id]).toEqual({ ga: 1, gb: 0 });
  });

  it('loadBackup vrací všechno včetně průběhu her', async () => {
    const { repo, result } = await setup();
    await repo.tapScore('t1', m.id, [goal('e1')]);
    expect((await result.current.loadBackup()).trainings[0].events).toHaveLength(1);
  });
});

describe('useAppState – dorovnání jen o změny', () => {
  const none = (cursor: string): Changes => ({ cursor, players: [], trainings: [], scores: [], solo: [], playTimes: [], deleted: { players: [], trainings: [], scores: [], solo: [], playTimes: [] } });

  /** Úložiště, které umí změny: první načtení vrací kurzor, další dotazy jdou přes loadChanges. */
  function withChanges(reply: (cursor: string) => Awaited<ReturnType<Repository['loadChanges']>>) {
    const base = memoryRepository({ players: [], trainings: [{ ...t, scores: { [m.id]: { ga: 1, gb: 0 }, stary: { ga: 2, gb: 2 } } }] });
    const asked: string[] = [];
    const repo: Repository & { loads(): number } = {
      ...base,
      loadAll: async () => ({ ...(await base.loadAll()), cursor: 'c1' }),
      loadChanges: async (cursor) => {
        asked.push(cursor);
        return reply(cursor);
      },
    };
    return { repo, asked, base };
  }

  it('po prvním načtení se ptá jen na změny od kurzoru a kurzor posouvá', async () => {
    const { repo, asked, base } = withChanges((cursor) => ({
      changes: { ...none(cursor === 'c1' ? 'c2' : 'c3'), scores: [{ trainingId: 't1', matchId: m.id, score: { ga: 4, gb: 1 } }], deleted: { players: [], trainings: [], scores: [{ trainingId: 't1', matchId: 'stary' }], solo: [], playTimes: [] } },
    }));
    const { result } = renderHook(() => useAppState(repo, { loadWaitMs: 30 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await idle();
    expect(asked).toEqual([]);
    visible();
    await waitFor(() => expect(result.current.data.trainings[0].scores).toEqual({ [m.id]: { ga: 4, gb: 1 } }));
    visible();
    await idle();
    expect(asked).toEqual(['c1', 'c2']);
    expect(base.loads()).toBe(1);
  });

  it('když server místo změn pošle kompletní data (starý kurzor), nahradí stav', async () => {
    const { repo } = withChanges(() => ({ full: { players: [{ id: 'a', name: 'A', archived: false, order: 0 }], trainings: [], cursor: 'c9' } }));
    const { result } = renderHook(() => useAppState(repo, { loadWaitMs: 30 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await idle();
    visible();
    await waitFor(() => expect(result.current.data.trainings).toEqual([]));
    expect(result.current.data.players).toHaveLength(1);
  });

  it('odmítnutý zápis srovná stav kompletním načtením, ne jen změnami', async () => {
    const { repo, asked, base } = withChanges((cursor) => ({ changes: none(cursor) }));
    const failing = { ...repo, savePlayer: async () => Promise.reject(Object.assign(new (await import('../storage/errors')).StorageError('odmítnuto', true, 'chybí oprávnění'))) };
    const { result } = renderHook(() => useAppState(failing, { loadWaitMs: 30 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.savePlayer({ id: 'x', name: 'X', archived: false, order: 0 }));
    await waitFor(() => expect(result.current.saveError).toMatch(/nepodařilo uložit/));
    await waitFor(() => expect(result.current.data.players).toEqual([]));
    expect(asked).toEqual([]);
    expect(base.loads()).toBe(2);
  });
});

describe('useAppState – stav spojení', () => {
  it('nepovedené dorovnání = bez spojení; povedené ho vrátí', async () => {
    const { repo, result } = await setup();
    await idle();
    expect(result.current.offline).toBe(false);
    repo.failLoads(true);
    visible();
    await waitFor(() => expect(result.current.offline).toBe(true));
    expect(result.current.status).toBe('ready');
    repo.failLoads(false);
    visible();
    await waitFor(() => expect(result.current.offline).toBe(false));
  });

  it('odpojený odběr živých změn = bez spojení; po připojení zpět', async () => {
    const { repo, result } = await setup();
    await idle();
    act(() => repo.emit().live?.(false));
    expect(result.current.offline).toBe(true);
    act(() => repo.emit().live?.(true));
    expect(result.current.offline).toBe(false);
  });
});
