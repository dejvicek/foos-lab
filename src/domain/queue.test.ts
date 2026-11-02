import { computeDelayLadder, delayStats, queueOf, runQueue, type QueueEntry } from './queue';
import { buildSchedule } from './schedule';
import type { PlayTimes, Training } from './types';
import { H } from '../test/fixtures';

const M = 60_000;
const T0 = 1_000_000 * M; // začátek tréninku
const at = (min: number) => T0 + min * M;
const item = (id: string, players: string[], table: number): QueueEntry => ({ kind: 'item', id, players, table, label: id, group: false });
const pause = (min: number): QueueEntry => ({ kind: 'pause', min, label: 'Pauza' });

describe('fronta utkání (aktivní utkání)', () => {
  it('první utkání jsou aktivní od začátku tréninku na stole z rozpisu', () => {
    const q = [item('a', ['p1', 'p2'], 1), item('b', ['p3', 'p4'], 2)];
    const s = runQueue(q, {}, T0, [1, 2], at(1));
    expect(s.get('a')).toMatchObject({ state: 'ready', table: 1, activeAt: T0 });
    expect(s.get('b')).toMatchObject({ state: 'ready', table: 2, activeAt: T0 });
  });

  it('utkání čeká, dokud jeho hráč hraje; aktivní od konce předchozího', () => {
    const q = [item('a', ['p1', 'p2'], 1), item('b', ['p3', 'p4'], 2), item('c', ['p1', 'p3'], 1)];
    let s = runQueue(q, { a: { startedAt: at(1) } }, T0, [1, 2], at(5));
    expect(s.get('a')!.state).toBe('playing');
    expect(s.get('c')).toMatchObject({ state: 'queued', activeAt: null, blockedBy: ['p1', 'p3'] });
    s = runQueue(q, { a: { startedAt: at(1), endedAt: at(9) }, b: { startedAt: at(2), endedAt: at(7) } }, T0, [1, 2], at(10));
    expect(s.get('c')).toMatchObject({ state: 'ready', table: 1, activeAt: at(9) });
  });

  it('když je stůl z rozpisu obsazený a jiný volný, utkání dostane volný stůl', () => {
    const q = [item('a', ['p1', 'p2'], 1), item('b', ['p3', 'p4'], 2), item('c', ['p3', 'p4'], 1)];
    const s = runQueue(q, { a: { startedAt: at(0) }, b: { startedAt: at(0), endedAt: at(6) } }, T0, [1, 2], at(8));
    expect(s.get('c')).toMatchObject({ state: 'ready', table: 2, activeAt: at(6) });
  });

  it('kdo má v pořadí dřívější neukončené utkání, nemůže hrát další', () => {
    const q = [item('a', ['p1', 'p2'], 1), item('b', ['p2', 'p3'], 2), item('c', ['p3', 'p4'], 2)];
    const s = runQueue(q, {}, T0, [1, 2], at(1));
    expect(s.get('b')!.state).toBe('queued'); // p2 je ve vypsaném a
    expect(s.get('c')!.state).toBe('queued'); // p3 čeká na b
  });

  it('pauza je přehrada: začne po posledním utkání před ní a trvá svou délku', () => {
    const q = [item('a', ['p1', 'p2'], 1), item('b', ['p3', 'p4'], 2), pause(10), item('c', ['p1', 'p3'], 1)];
    let s = runQueue(q, { a: { startedAt: at(0), endedAt: at(8) } }, T0, [1, 2], at(9));
    expect(s.get('c')!.state).toBe('queued'); // b ještě nedohrálo
    s = runQueue(q, { a: { startedAt: at(0), endedAt: at(8) }, b: { startedAt: at(0), endedAt: at(12) } }, T0, [1, 2], at(15));
    expect(s.get('c')).toMatchObject({ state: 'queued', activeAt: at(22) }); // pauza běží
    s = runQueue(q, { a: { startedAt: at(0), endedAt: at(8) }, b: { startedAt: at(0), endedAt: at(12) } }, T0, [1, 2], at(23));
    expect(s.get('c')).toMatchObject({ state: 'ready', activeAt: at(22) });
  });

  it('zahájené dřív, než by bylo aktivní: čekání 0', () => {
    const q = [item('a', ['p1', 'p2'], 1), item('c', ['p1', 'p3'], 1)];
    const s = runQueue(q, { c: { startedAt: at(3) } }, T0, [1], at(5));
    expect(s.get('c')).toMatchObject({ state: 'playing', activeAt: at(3) });
  });

  it('fronta z rozpisu: zápasy i cvičení (skupina = utkání), pauzy; bez závěrečného zápisu', () => {
    const t: Training = {
      id: 't', date: '2026-11-02', startTime: '18:00', mode: 'team', tables: 4, attendees: H(8), scores: {}, soloResults: {},
      simSplit: 'order', simTeams: null, format: 'custom', durationMin: 60, plan: { warmupPasses: 1, normal: 2 }, lockedRounds: [],
      breaks: [{ after: 1, min: 10 }],
    };
    const q = queueOf(buildSchedule(t));
    expect(q.map((e) => e.kind)).toEqual(['item', 'item', 'item', 'item', 'pause', 'item', 'item', 'item', 'item']);
    const first = q[0] as Extract<QueueEntry, { kind: 'item' }>;
    expect(first.group).toBe(true);
    expect(first.id).toMatch(/^drill\|Kolo 1\|1\|/);
    expect(q.filter((e) => e.kind === 'item' && !e.group).every((e) => e.kind === 'item' && e.id.startsWith('league|'))).toBe(true);
    expect((q[4] as Extract<QueueEntry, { kind: 'pause' }>).min).toBe(10);
  });
});

describe('Zdržovači', () => {
  const q = [item('a', ['p1', 'p2'], 1), item('b', ['p3', 'p4'], 2), item('c', ['p1', 'p3'], 1)];
  const times: PlayTimes = {
    a: { startedAt: at(2), endedAt: at(10) }, // čekání 2, hra 8
    b: { startedAt: at(0), endedAt: at(6) }, // čekání 0, hra 6
    c: { startedAt: at(14), endedAt: at(20) }, // aktivní v 10 → čekání 4, hra 6
  };

  it('v tréninku: čekání a hra na hráče, řazeno podle průměrného čekání', () => {
    const rows = delayStats(q, runQueue(q, times, T0, [1, 2], at(30)));
    expect(rows.map((r) => r.playerId)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(rows[0]).toMatchObject({ items: 2, waitSum: 6 * M, waitAvg: 3 * M, playAvg: 7 * M });
    expect(rows.find((r) => r.playerId === 'p4')).toMatchObject({ items: 1, waitSum: 0 });
  });

  it('v žebříčku: období a Průměr / Celkem', () => {
    const tr = (id: string, date: string) => ({ id, date }) as Training;
    const ctx = () => ({ queue: q, states: runQueue(q, times, T0, [1, 2], at(30)) });
    const two = [tr('x', '2026-10-01'), tr('y', '2026-10-30')];
    const all = computeDelayLadder(two, { kind: 'all' }, 'avg', '2026-10-31', ctx);
    expect(all[0]).toMatchObject({ playerId: 'p1', trainings: 2, items: 4, waitAvg: 3 * M });
    const form = computeDelayLadder(two, { kind: 'form' }, 'total', '2026-10-31', ctx);
    expect(form[0]).toMatchObject({ playerId: 'p1', trainings: 1, waitSum: 6 * M });
  });
});
