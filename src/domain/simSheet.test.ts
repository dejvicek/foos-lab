import { buildSchedule } from './schedule';
import { simSheet } from './simSheet';
import type { Score, Training } from './types';
import { H } from '../test/fixtures';

const custom = (plan: Training['plan']): Training => ({
  id: 'c', date: '2026-11-18', startTime: '18:00', mode: 'team', tables: 4, attendees: H(8), scores: {}, soloResults: {},
  simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan, lockedRounds: [],
});

describe('simulace jako ligový zápis (19. 11. 2026)', () => {
  const t = custom({ normal: 1, sim: 1 });
  const s = buildSchedule(t);
  const sims = s.matches.filter((m) => m.block === 'sim').sort((a, b) => a.round - b.round || a.table - b.table);

  it('bez simulace nic', () => {
    expect(simSheet(buildSchedule(custom({ normal: 1 })), {}, t.attendees)).toBeNull();
  });

  it('řádky v pořadí rozpisu (vlna, stůl); sestava A, B … / 1, 2 … podle nominace; nic nezapsáno = čeká', () => {
    const sh = simSheet(s, {}, t.attendees)!;
    expect(sh.rows.map((r) => [r.no, r.wave, r.sideA, r.sideB])).toEqual(sims.map((m, i) => [i + 1, m.round, m.sideA, m.sideB]));
    expect(sh.teamA.map((x) => x.code)).toEqual(['A', 'B', 'C', 'D']);
    expect(sh.teamB.map((x) => x.code)).toEqual(['1', '2', '3', '4']);
    expect(sh.teamA.map((x) => x.id)).toEqual(t.attendees.filter((p) => sims.some((m) => m.sideA.includes(p))));
    expect(sh.rows.every((r) => r.state === 'waiting' && r.points === null)).toBe(true);
    expect(sh.points).toEqual([0, 0]);
  });

  it('Body = vyhraný zápas, Hry = legy, Stav průběžně; rozehraný zápas hry zatím, body ne', () => {
    const [m1, m2, m3] = sims;
    const scores: Record<string, Score> = {
      [m1.id]: { ga: 6, gb: 4 }, [`${m1.id}#2`]: { ga: 6, gb: 3 }, // 2:0 pro A
      [m2.id]: { ga: 4, gb: 6 }, [`${m2.id}#2`]: { ga: 6, gb: 2 }, [`${m2.id}#3`]: { ga: 5, gb: 7 }, // 1:2 pro B
      [m3.id]: { ga: 6, gb: 1 }, [`${m3.id}#2`]: { ga: 2, gb: 3 }, // rozehráno
    };
    const sh = simSheet(s, scores, t.attendees)!;
    expect(sh.rows[0]).toMatchObject({ state: 'done', points: [1, 0], games: [2, 0], legs: [[6, 4], [6, 3]], running: [1, 0] });
    expect(sh.rows[1]).toMatchObject({ state: 'done', points: [0, 1], games: [1, 2], running: [1, 1] });
    expect(sh.rows[2]).toMatchObject({ state: 'playing', points: null, games: [1, 0], legs: [[6, 1], [2, 3]], running: null });
    expect(sh.points).toEqual([1, 1]);
    expect(sh.games).toEqual([4, 2]);
    expect(sh.played).toBe(2);
  });

  it('starší simulace v setech: Hry = sety, bez legů', () => {
    const old = { ...s, matches: s.matches.map((m) => (m.block === 'sim' ? { ...m, bestOf: undefined } : m)) };
    const sh = simSheet(old, { [sims[0].id]: { ga: 2, gb: 1 } }, t.attendees)!;
    expect(sh.rows[0]).toMatchObject({ state: 'done', points: [1, 0], games: [2, 1], legs: [] });
  });
});
