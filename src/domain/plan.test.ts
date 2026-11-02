import { DISCIPLINES, discipline } from './disciplines';
import { autoPlan, DEFAULT_SELECTION, drillRoundsNeeded, planSequence, planTimeline, plannedMinutes } from './plan';

describe('katalog disciplín', () => {
  it('cvičení, zápasy včetně Jedniček a simulace v pořadí PRD 4.6', () => {
    expect(DISCIPLINES.map((d) => d.id)).toEqual([
      'warmupPasses', 'passWallLane', 'fiveBarControl', 'setShooting', 'penaltyKeeper', 'penaltySolo', 'backShotKeeper', 'backShotSolo',
      'blockToControl', 'backRodsBuildUp', 'chain',
      'normal', 'lossTax', 'wall', 'start03', 'start44', 'start45', 'start55', 'singles', 'sim',
    ]);
    expect(discipline('start03')).toMatchObject({ kind: 'match', min: 5, lossTax: true, start: [0, 3] });
    expect(discipline('singles')).toMatchObject({ kind: 'match', min: 8, singlesOnly: true });
    expect(discipline('sim')).toMatchObject({ kind: 'sim', min: 40 });
  });
});

describe('časový plán', () => {
  it('cvičení má tolik kol, aby se všichni vystřídali', () => {
    expect(drillRoundsNeeded(13, 4)).toBe(2);
    expect(drillRoundsNeeded(13, 2)).toBe(4);
    expect(drillRoundsNeeded(8, 4)).toBe(1);
  });

  it('pořadí: cvičení, zápasy, simulace; kola stejné disciplíny za sebou', () => {
    expect(planSequence({ wall: 2, warmupPasses: 1, sim: 1, normal: 1 })).toEqual(['warmupPasses', 'normal', 'wall', 'wall', 'sim']);
  });

  it('časová osa: přechod 1 min, výchozí pauza 10 min po každé sekci, na konci Zápis 10 min', () => {
    // jen zápasy = jedna sekce → žádná pauza
    expect(planTimeline(['normal', 'normal', 'normal']).items.map((i) => i.kind)).toEqual(['round', 'round', 'round', 'final']);
    const tl = planTimeline(['warmupPasses', 'normal', 'normal', 'sim']);
    expect(tl.items.map((i) => i.kind)).toEqual(['round', 'break', 'round', 'round', 'break', 'round', 'final']);
    expect(tl.items[1]).toMatchObject({ kind: 'break', start: 9, min: 10 });
    expect(tl.items[2]).toMatchObject({ start: 19 });
    expect(tl.items.at(-1)).toMatchObject({ kind: 'final', start: 19 + 18 + 10 + 41, min: 10 });
  });

  it('kritérium 18: n=8, 4 stoly, 3:00, výchozí výběr se vejde a naplní čas', () => {
    const plan = autoPlan(DEFAULT_SELECTION, 180, 8, 4);
    const used = plannedMinutes(plan);
    expect(used).toBeLessThanOrEqual(180);
    expect(used).toBeGreaterThan(165);
    expect(plan).toMatchObject({ warmupPasses: 1, fiveBarControl: 1, penaltyKeeper: 2, blockToControl: 1, sim: 1 });
    expect(plan.setShooting).toBeUndefined();
    expect(plan.chain).toBeUndefined();
    expect(plan.backRodsBuildUp).toBeUndefined();
    expect(plan.wall! % 2).toBe(0); // párová kola
    expect(plan.start03! % 2).toBe(0);
    expect(plan.normal).toBeGreaterThanOrEqual(1);
  });

  it('doplňuje jen zápasy, dokola v pořadí katalogu', () => {
    const plan = autoPlan(['normal', 'wall', 'start44'], 60, 8, 4);
    // 1 kolo každého (9+9+4=22) + final 10 = 32; dál dokola normal(9), wall(9), start44(4) …
    expect(plannedMinutes(plan)).toBeLessThanOrEqual(60);
    expect(plan.normal! - plan.wall!).toBeGreaterThanOrEqual(0);
    expect(plan.normal! - plan.wall!).toBeLessThanOrEqual(1);
  });

  it('respektuje minimum zamčených kol', () => {
    expect(autoPlan(['normal'], 60, 8, 4, { wall: 2 }).wall).toBe(2);
  });

  it('13 hráčů na 4 stolech: každé cvičení 2 kola', () => {
    expect(autoPlan(['setShooting', 'normal'], 120, 13, 4).setShooting).toBe(2);
  });
});

it('délky kol startů (2. 11. 2026): Start 4:4 5 min, Start 5:5 6 min', () => {
  expect(discipline('start44').min).toBe(5);
  expect(discipline('start55').min).toBe(6);
  expect(discipline('start03').min).toBe(5);
});

it('Start 4:5 (2. 11. 2026): koncovka pozadu o gól, 5 min, bez Daně, vždy 2 kola s prohozenými stranami', () => {
  expect(discipline('start45')).toMatchObject({ kind: 'match', name: 'Start 4:5', min: 5, start: [4, 5], paired: true });
  expect(discipline('start45').lossTax).toBeFalsy();
  // nabízí se, ale ve výchozím výběru není – výchozí 3:00 by se nevešla (minima 189 min)
  expect(DEFAULT_SELECTION).not.toContain('start45');
  expect(discipline('start45').retired).toBeFalsy();
});
