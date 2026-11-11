import { streakLimitSec, streakState, streakTap, streakTime, streakTimeUp } from './streak';
import { soloMetric, STREAK_CAP } from './solo';
import { drillCount } from './drillTap';
import { computeSoloLadder } from './soloLadder';
import { newPractice } from './practice';
import { setAttempts, setSolo } from './training';
import { training, H } from '../test/fixtures';
import type { GameEvent, Training } from './types';

const def = soloMetric('streakShot3');
const T0 = 1_000_000;
let n = 0;
const ev = (ok: boolean, sec: number, playerId = 'H1', itemId = 'round|1', delta: 1 | -1 = 1): GameEvent => ({
  id: `e${n++}`, itemId, at: T0 + sec * 1000, kind: ok ? 'hit' : 'miss', playerId, delta,
});
const hits = (k: number, from: number) => Array.from({ length: k }, (_, i) => ev(true, from + i * 5));

describe('Čistá desítka – série na čas', () => {
  it('nepovedený pokus nuluje sérii; čas od zahájení do 10. povedeného po sobě', () => {
    const events = [...hits(6, 10), ev(false, 40), ...hits(10, 50)];
    const s = streakState(events, 'H1', 'round|1', T0, 10);
    expect(s).toMatchObject({ run: 10, attempts: 17, doneAt: T0 + 95_000, seconds: 95 });
    expect(streakState([...hits(6, 10), ev(false, 40)], 'H1', 'round|1', T0, 10)).toMatchObject({ run: 0, attempts: 7, seconds: null });
  });

  it('jen události hráče a kola; bez zahájení se měří od prvního pokusu; Zpět ruší poslední', () => {
    const events = [...hits(9, 20), ev(true, 70, 'H2'), ev(true, 66, 'H1', 'round|2')];
    expect(streakState(events, 'H1', 'round|1', undefined, 10)).toMatchObject({ run: 9, startedAt: T0 + 20_000, seconds: null });
    const undone = [...hits(10, 0), ev(true, 60, 'H1', 'round|1', -1)];
    expect(streakState(undone, 'H1', 'round|1', T0, 10)).toMatchObject({ run: 9, attempts: 9, doneAt: null });
  });

  it('desátý povedený po sobě zapíše čas; nepovedený a ostatní povedené jen pokus', () => {
    const nine = streakState(hits(9, 0), 'H1', 'round|1', T0, 10);
    expect(streakTap(nine, def, true, 1, T0 + 125_000, 0)).toEqual({ dValue: 125, dAttempts: 1 });
    expect(streakTap(nine, def, false, 1, T0 + 125_000, 0)).toEqual({ dValue: 0, dAttempts: 1 });
    const one = streakState(hits(1, 0), 'H1', 'round|1', T0, 10);
    expect(streakTap(one, def, true, 1, T0 + 9_000, 0)).toEqual({ dValue: 0, dAttempts: 1 });
  });

  it('po splnění dál nejde; Zpět posledního povedeného smaže čas, jiný druh vrátit nejde', () => {
    const done = streakState(hits(10, 0), 'H1', 'round|1', T0, 10);
    expect(streakTap(done, def, true, 1, T0 + 99_000, 45)).toBeNull();
    expect(streakTap(done, def, true, -1, T0 + 99_000, 45)).toEqual({ dValue: -45, dAttempts: -1 });
    expect(streakTap(done, def, false, -1, T0 + 99_000, 45)).toBeNull();
    const miss = streakState([ev(false, 3)], 'H1', 'round|1', T0, 10);
    expect(streakTap(miss, def, false, -1, T0, 0)).toEqual({ dValue: 0, dAttempts: -1 });
    expect(streakTap(streakState([], 'H1', 'round|1', T0, 10), def, true, -1, T0, 0)).toBeNull();
  });

  it('klubový trénink: po délce kola (10 min) už nejde ťukat; vlastní trénink limit nemá', () => {
    const club = { ...training('c', '2026-11-11', 'team', H(4), 2), format: 'custom' as const, disciplineMin: { streakShot3: 10 } };
    expect(streakLimitSec(club, 'streakShot3@1')).toBe(600);
    expect(streakLimitSec(newPractice('p', '2026-11-11', '18:00', 'H1', null, ['streakShot3']), 'streakShot3@1')).toBeNull();
    const s = streakState(hits(3, 0), 'H1', 'round|1', T0, 10);
    expect(streakTimeUp(s, 600, T0 + 600_000)).toBe(false);
    expect(streakTimeUp(s, 600, T0 + 601_000)).toBe(true);
    expect(streakTap(s, def, true, 1, T0 + 601_000, 0, 600)).toBeNull();
    expect(streakTap(s, def, true, 1, T0 + 601_000, 0, null)).toEqual({ dValue: 0, dAttempts: 1 });
  });

  it('hotovo = splněno (čas > 0); pokusy jen do pojistky', () => {
    expect(drillCount({ value: 0, attempts: 30 }, def).done).toBe(false);
    expect(drillCount({ value: 84, attempts: 14 }, def)).toMatchObject({ value: 84, attempts: 14, done: true });
    const s = { ...streakState([], 'H1', 'round|1', T0, 10), attempts: STREAK_CAP };
    expect(streakTap(s, def, false, 1, T0, 0)).toBeNull();
  });

  it('čas „m:ss“', () => {
    expect(streakTime(65)).toBe('1:05');
    expect(streakTime(600)).toBe('10:00');
  });
});

describe('žebříček Čisté desítky', () => {
  const p = (id: string, player: string, sec: number, attempts: number): Training =>
    setAttempts(setSolo(newPractice(id, '2026-11-10', '18:00', player, null, ['streakShot3']), player, 'streakShot3@1', sec), player, 'streakShot3@1', attempts);

  it('podle nejlepšího času (méně = lépe); kdo nesplnil, je za ostatními; málo dat pod 3 tréninky', () => {
    const ts = [
      p('a1', 'H1', 120, 20), p('a2', 'H1', 95, 15), p('a3', 'H1', 0, 40),
      p('b1', 'H2', 80, 12), p('b2', 'H2', 300, 50), p('b3', 'H2', 200, 30),
      p('c1', 'H3', 0, 30), p('c2', 'H3', 0, 25), p('c3', 'H3', 0, 60),
      p('d1', 'H4', 10, 10),
    ];
    const table = computeSoloLadder(ts, { kind: 'all' }, 'avg', '2026-11-11', 'practice').find((x) => x.metric === 'streakShot3')!;
    expect(table.ranked.map((r) => r.playerId)).toEqual(['H2', 'H1', 'H3']);
    expect(table.ranked[0]).toMatchObject({ trainings: 3, records: 3, sum: 3, best: 80 });
    expect(table.ranked[1]).toMatchObject({ best: 95, sum: 2, sumMax: 3 });
    expect(table.ranked[2]).toMatchObject({ best: null, sum: 0 });
    expect(table.lowData.map((r) => r.playerId)).toEqual(['H4']);
  });
});
