import { lostEntries, moveAttendee, moveDiscipline, newTraining, withAttendees, pruneEntries, setScore, setSolo, sortTrainings, toggleAttendee } from './training';
import { breaksOf } from './breaks';
import { orderedDisciplines } from './plan';
import type { DisciplineId, Player, Training } from './types';
import { H, training } from '../test/fixtures';

const roster = (ids: string[]): Player[] => ids.map((id, order) => ({ id, name: id, order, archived: false }));

describe('newTraining', () => {
  it('bez předchozího a bez šablony: konfigurovatelný, 3:00, nic vybráno, 4 stoly, nikdo nepřítomen', () => {
    const t = newTraining('x', '2026-10-31', null);
    expect(t).toMatchObject({
      id: 'x', date: '2026-10-31', startTime: '18:00', tables: 4, attendees: [], scores: {}, soloResults: {},
      simSplit: 'performance', simTeams: null, format: 'custom', durationMin: 180, lockedRounds: [],
    });
    expect(t.plan).toEqual({});
  });
  it('výběr a délka z šablony, ne z posledního tréninku (9. 11. 2026); bez automatických pauz', () => {
    const last = { ...newTraining('l', '2026-10-01', null), durationMin: 120, plan: { normal: 3 } };
    const tpl = { id: 'k', name: 'Krátký', durationMin: 60, selection: ['normal', 'setShooting'] as DisciplineId[] };
    const t = newTraining('x', '2026-10-31', last, null, tpl);
    expect(t.durationMin).toBe(60);
    expect(Object.keys(t.plan).sort()).toEqual(['normal', 'penaltyKeeper']); // stará Penalta → proti brankáři
    expect(t.breaks).toEqual([]);
  });
  it('stoly a začátek převezme z posledního tréninku, typ je vždy týmový', () => {
    const last = training('l', '2026-10-01', 'single', H(5), 2);
    expect(newTraining('x', '2026-10-31', { ...last, startTime: '17:30' })).toMatchObject({ mode: 'team', tables: 2, attendees: [], startTime: '17:30' });
  });
});

describe('toggleAttendee', () => {
  const r = roster(['A', 'B', 'C', 'D']);
  const t = (attendees: string[]): Training => ({ ...training('t', '2026-10-31', 'team', attendees) });
  it('přidá hráče na místo podle soupisky', () => {
    expect(toggleAttendee(t(['A', 'C']), 'B', r).attendees).toEqual(['A', 'B', 'C']);
    expect(toggleAttendee(t([]), 'C', r).attendees).toEqual(['C']);
    expect(toggleAttendee(t(['C']), 'A', r).attendees).toEqual(['A', 'C']);
  });
  it('při upraveném pořadí vloží za posledního, kdo je na soupisce před ním', () => {
    expect(toggleAttendee(t(['C', 'A']), 'B', r).attendees).toEqual(['C', 'A', 'B']);
  });
  it('odebere přítomného', () => {
    expect(toggleAttendee(t(['A', 'B', 'C']), 'C', r).attendees).toEqual(['A', 'B']);
  });
});

describe('moveAttendee', () => {
  it('posune nahoru/dolů, na okraji nic', () => {
    const t = training('t', '2026-10-31', 'team', ['A', 'B', 'C']);
    expect(moveAttendee(t, 'B', -1).attendees).toEqual(['B', 'A', 'C']);
    expect(moveAttendee(t, 'C', 1).attendees).toEqual(['A', 'B', 'C']);
  });
});

describe('skóre při změně konfigurace', () => {
  const base = setScore(training('t', '2026-10-31', 'team', H(8)), 'league|1|1|H1+H2vH3+H4', 'ga', 6);
  it('setScore nastaví pole, null hodnoty ponechá', () => {
    expect(base.scores['league|1|1|H1+H2vH3+H4']).toEqual({ ga: 6 });
  });
  it('lostScores vrátí skórované zápasy, které v novém rozpisu nejsou', () => {
    const after = { ...base, attendees: H(8).slice(1) }; // bez H1
    expect(lostEntries(base, after).scores).toEqual(['league|1|1|H1+H2vH3+H4']);
    expect(lostEntries(base, { ...base, notes: 'x' }).scores).toEqual([]);
  });
  it('prázdné skóre se nepočítá jako ztracené', () => {
    const t = { ...base, scores: { 'league|1|1|H1+H2vH3+H4': { ga: null, gb: null } } };
    expect(lostEntries(t, { ...t, attendees: H(8).slice(1) }).scores).toEqual([]);
  });
  it('pruneScores nechá jen skóre existujících zápasů', () => {
    expect(pruneEntries({ ...base, attendees: H(8).slice(1) }).scores).toEqual({});
    expect(pruneEntries(base).scores).toEqual(base.scores);
  });
  it('nepostavitelný trénink = žádné zápasy', () => {
    expect(pruneEntries({ ...base, attendees: H(3) }).scores).toEqual({});
  });
  it('archivovaný hráč v přítomných nic nemaže (skóre je vázané na ID)', () => {
    expect(pruneEntries(base)).toEqual(base);
  });
});

describe('sortTrainings', () => {
  it('nejnovější první, stabilně', () => {
    const ts = [training('a', '2026-10-01', 'team', []), training('b', '2026-10-05', 'team', []), training('c', '2026-10-05', 'team', [])];
    expect(sortTrainings(ts).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('výsledky sólové části při změně konfigurace', () => {
  const base = (): Training => {
    let t = training('t', '2026-10-31', 'team', H(8), 4);
    t = setSolo(t, 'H1', 'fiveBarControl', 2);
    t = setSolo(t, 'H1', 'backRodsBuildUp', 7);
    t = setSolo(t, 'H2', 'warmupPasses', 15);
    t = setSolo(t, 'H8', 'setShooting', 11);
    return t;
  };

  it('setSolo nastaví a null smaže klíč i prázdného hráče', () => {
    const t = setSolo(setSolo(training('t', '2026-10-31', 'team', H(8)), 'H1', 'chain', 3), 'H1', 'chain', null);
    expect(t.soloResults).toEqual({});
  });

  it('odebraný hráč přijde o své výsledky', () => {
    const before = base();
    const after = { ...before, attendees: H(7) };
    expect(lostEntries(before, after).solo).toEqual([{ playerId: 'H8', metric: 'setShooting', key: 'setShooting' }]);
    expect(pruneEntries(after).soloResults.H8).toBeUndefined();
  });

  it('4 → 2 stoly: zmizí jen stanoviště 3', () => {
    const before = base();
    const after = { ...before, tables: 2 as const };
    expect(lostEntries(before, after).solo).toEqual([{ playerId: 'H1', metric: 'backRodsBuildUp', key: 'backRodsBuildUp' }]);
    expect(pruneEntries(after).soloResults.H1).toEqual({ fiveBarControl: 2 });
  });

  it('týmový → jedničky: zůstane jen rozehrávka z dvojky', () => {
    const after = pruneEntries({ ...base(), mode: 'single' as const, tables: 4 as const });
    expect(after.soloResults).toEqual({ H1: { backRodsBuildUp: 7 } });
  });

  it('prohození pořadí nic nesmaže', () => {
    const before = base();
    const after = { ...before, attendees: [...H(8)].reverse() };
    expect(lostEntries(before, after)).toEqual({ scores: [], solo: [] });
  });

  it('lostEntries vrací i ztracená skóre', () => {
    const before = setScore(base(), 'league|1|1|H1+H2vH3+H4', 'ga', 6);
    expect(lostEntries(before, { ...before, attendees: H(8).slice(1) }).scores).toEqual(['league|1|1|H1+H2vH3+H4']);
  });
});

describe('moveDiscipline (tabulka v průvodci, 10. 11. 2026)', () => {
  const t = (over: Partial<Training> = {}): Training => ({
    ...training('m', '2026-11-10', 'team', H(8)),
    format: 'custom',
    plan: { warmupPasses: 2, fiveBarControl: 2, normal: 3, wall: 2, start44: 1 },
    ...over,
  });
  const seq = (x: Training) => orderedDisciplines(x.disciplineOrder).filter((id) => (x.plan[id] ?? 0) > 0);

  it('přeřadí disciplínu uvnitř sekce; sekce zůstanou v pořadí cvičení → zápasy', () => {
    const a = moveDiscipline(t(), 'start44', 0);
    expect(seq(a)).toEqual(['warmupPasses', 'fiveBarControl', 'start44', 'normal', 'wall']);
    const b = moveDiscipline(a, 'warmupPasses', 1);
    expect(seq(b)).toEqual(['fiveBarControl', 'warmupPasses', 'start44', 'normal', 'wall']);
    // mimo rozsah / stejné místo → beze změny
    expect(moveDiscipline(b, 'normal', 5)).toBe(b);
    expect(moveDiscipline(b, 'start44', 0)).toBe(b);
  });

  it('pauza za disciplínou se přesune s ní', () => {
    // po fiveBarControl (po 4. kole)
    const before = t({ breaks: [{ after: 4, min: 10 }] });
    const after = moveDiscipline(before, 'fiveBarControl', 0);
    expect(seq(after).slice(0, 2)).toEqual(['fiveBarControl', 'warmupPasses']);
    expect(breaksOf(after)).toEqual([{ after: 2, min: 10 }]);
  });
});

describe('withAttendees („Jako minule“, 10. 11. 2026)', () => {
  const roster: Player[] = ['C', 'A', 'B', 'D'].map((name, order) => ({ id: name, name, order, archived: false }));
  it('přítomní v pořadí soupisky; kdo na soupisce není nebo je archivovaný, se vynechá', () => {
    const t = { ...training('w', '2026-11-10', 'team', []) };
    expect(withAttendees(t, ['B', 'C', 'X'], roster).attendees).toEqual(['C', 'B']);
    const archived = roster.map((p) => (p.id === 'B' ? { ...p, archived: true } : p));
    expect(withAttendees(t, ['B', 'C'], archived).attendees).toEqual(['C']);
    expect(withAttendees({ ...t, attendees: ['A'] }, [], roster).attendees).toEqual([]);
  });
});
