import { buildSchedule } from './schedule';
import { autoPlan } from './plan';
import { canCreateTraining, canManage, canWriteMatch, canWriteSolo, myAssignments, viewerOf } from './my';
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

describe('organizátor a zakladatel tréninku (10. 11. 2026)', () => {
  const t = { ...custom(9), createdBy: 'H9' };
  const s = buildSchedule(t);
  const m = s.matches.find((x) => x.block === 'league' && !x.sideA.includes('H9') && !x.sideB.includes('H9') && x.referee !== 'H9')! as Match;
  const organizer = { playerId: 'H9', isAdmin: false, isOrganizer: true };
  it('organizátor, který trénink založil, zapisuje do všech zápasů a za kohokoli ve cvičení', () => {
    expect(canWriteMatch(organizer, m, t)).toBe(true);
    expect(canWriteSolo(organizer, ['H1', 'H2'], 'H1', t)).toBe(true);
  });
  it('spravuje jen svůj trénink; zakladatel bez role organizátora nespravuje nic', () => {
    expect(canManage(organizer, t)).toBe(true);
    expect(canManage({ playerId: 'H1', isAdmin: false, isOrganizer: true }, t)).toBe(false);
    expect(canManage({ playerId: 'H9', isAdmin: false }, t)).toBe(false);
    expect(canWriteMatch({ playerId: 'H9', isAdmin: false }, m, t)).toBe(false);
    expect(canManage({ playerId: 'H1', isAdmin: true }, t)).toBe(true);
  });
  it('zakládat tréninky smí jen admin a organizátor', () => {
    expect(canCreateTraining({ playerId: 'H1', isAdmin: true })).toBe(true);
    expect(canCreateTraining({ playerId: 'H1', isAdmin: false, isOrganizer: true })).toBe(true);
    expect(canCreateTraining({ playerId: 'H1', isAdmin: false })).toBe(false);
    expect(canCreateTraining({ playerId: null, isAdmin: false, isOrganizer: true })).toBe(false);
  });
  it('viewerOf: organizátor podle soupisky (změna adminem platí hned)', () => {
    const players = [{ id: 'H1', name: 'A', order: 0, archived: false, organizer: true }, { id: 'H2', name: 'B', order: 1, archived: false }];
    expect(viewerOf('H1', false, players)).toEqual({ playerId: 'H1', isAdmin: false, isOrganizer: true });
    expect(viewerOf('H2', false, players)).toEqual({ playerId: 'H2', isAdmin: false, isOrganizer: false });
    // archivovaný organizátor už nic nezakládá
    expect(viewerOf('H1', false, [{ ...players[0], archived: true }]).isOrganizer).toBe(false);
  });
});
