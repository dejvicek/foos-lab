import { DISCIPLINES, discipline } from './disciplines';
import { autoPlan, DEFAULT_SELECTION, drillRoundsNeeded, planSequence, planTimeline, plannedMinutes } from './plan';

describe('katalog disciplín', () => {
  it('cvičení, zápasy včetně Jedniček a simulace v pořadí PRD 4.6', () => {
    expect(DISCIPLINES.map((d) => d.id)).toEqual([
      'warmupPasses', 'fiveBarControl', 'setShooting', 'blockToControl', 'backRodsBuildUp', 'chain',
      'normal', 'lossTax', 'wall', 'start03', 'start44', 'start55', 'singles', 'sim',
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

  it('časová osa: přechod 1 min, pauza 10 min po ~hodině, na konci Zápis 10 min', () => {
    const tl = planTimeline(['normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal']);
    // 8 × (8 + 1) = 72: pauza po kole, které jako první přesáhne 60 min → po 7. kole (63)
    expect(tl.items.map((i) => i.kind)).toEqual(['round', 'round', 'round', 'round', 'round', 'round', 'round', 'break', 'round', 'final']);
    expect(tl.items[7]).toMatchObject({ kind: 'break', start: 63, min: 10 });
    expect(tl.items[8]).toMatchObject({ start: 73 });
    expect(tl.items.at(-1)).toMatchObject({ kind: 'final', start: 82, min: 10 });
    expect(tl.total).toBe(92);
  });

  it('kritérium 18: n=8, 4 stoly, 3:00, výchozí výběr se vejde a naplní čas', () => {
    const plan = autoPlan(DEFAULT_SELECTION, 180, 8, 4);
    const used = plannedMinutes(plan);
    expect(used).toBeLessThanOrEqual(180);
    expect(used).toBeGreaterThan(165);
    expect(plan).toMatchObject({ warmupPasses: 1, fiveBarControl: 1, setShooting: 1, blockToControl: 1, backRodsBuildUp: 1, sim: 1 });
    expect(plan.chain).toBeUndefined();
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
