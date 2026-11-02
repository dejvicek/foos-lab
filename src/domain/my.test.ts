import { buildSchedule } from './schedule';
import { autoPlan } from './plan';
import { canWriteMatch, canWriteSolo, myAssignments } from './my';
import type { Match, Training } from './types';
import { H, training } from '../test/fixtures';

const custom = (n: number): Training => ({
  ...training('c', '2026-11-02', 'team', H(n), 4),
  format: 'custom',
  durationMin: 120,
  plan: autoPlan(['setShooting', 'normal', 'wall'], 120, n, 4),
});

describe('moje kola', () => {
  it('každé hrací kolo má pro hráče roli: hraje / rozhodčí / čeká', () => {
    const t = custom(9);
    const s = buildSchedule(t);
    const mine = myAssignments(s, 'H1');
    const rounds = s.sections.flatMap((x) => x.rows).filter((r) => r.kind !== 'break');
    expect(mine).toHaveLength(rounds.length);
    for (const a of mine) expect(['play', 'referee', 'wait']).toContain(a.role);
    const play = mine.find((a) => a.role === 'play' && a.match)!;
    expect([...play.match!.sideA, ...play.match!.sideB]).toContain('H1');
  });
});

describe('práva zápisu', () => {
  const t = custom(9);
  const s = buildSchedule(t);
  const m = s.matches.find((x) => x.block === 'league' && x.referee)! as Match;
  const player = m.sideA[0];
  const outsider = t.attendees.find((p) => ![...m.sideA, ...m.sideB, m.referee].includes(p))!;

  it('hráč zápasu a rozhodčí smí, ostatní ne, admin vždy', () => {
    expect(canWriteMatch({ playerId: player, isAdmin: false }, m, t)).toBe(true);
    expect(canWriteMatch({ playerId: m.referee!, isAdmin: false }, m, t)).toBe(true);
    expect(canWriteMatch({ playerId: outsider, isAdmin: false }, m, t)).toBe(false);
    expect(canWriteMatch({ playerId: 'cizi', isAdmin: true }, m, t)).toBe(true);
  });

  it('rozhodčí v klasickém tréninku zapisovat nesmí (server to neumí ověřit)', () => {
    expect(canWriteMatch({ playerId: m.referee!, isAdmin: false }, m, { ...t, format: 'classic' })).toBe(false);
  });

  it('hráč, který na tréninku není, nesmí nic', () => {
    expect(canWriteMatch({ playerId: player, isAdmin: false }, m, { ...t, attendees: t.attendees.filter((p) => p !== player) })).toBe(false);
  });

  it('cvičení: za sebe a za svou skupinu', () => {
    const g = ['H1', 'H2'];
    expect(canWriteSolo({ playerId: 'H1', isAdmin: false }, g, 'H2', t)).toBe(true);
    expect(canWriteSolo({ playerId: 'H3', isAdmin: false }, g, 'H2', t)).toBe(false);
    expect(canWriteSolo({ playerId: 'H1', isAdmin: false }, g, 'H1', { ...t, format: 'classic' })).toBe(true);
    expect(canWriteSolo({ playerId: 'H1', isAdmin: false }, g, 'H2', { ...t, format: 'classic' })).toBe(false);
  });
});
