import { DISCIPLINES, discipline } from './disciplines';
import { autoPlan, manualPlan, plannedMinutes, SOLO_SELECTION } from './plan';
import { buildSchedule, canBuildSchedule } from './schedule';
import { SOLO_METRICS, soloMetric } from './solo';
import { newTraining, replan, selectedDisciplines } from './training';
import type { DisciplineId, ScheduleRow, Training } from './types';
import { DEFAULT_SELECTION, H } from '../test/fixtures';

const custom = (n: number, tables: 1 | 2 | 3 | 4, plan: Training['plan'], over: Partial<Training> = {}): Training => ({
  id: 'v', date: '2026-11-02', startTime: '18:00', mode: 'team', tables, attendees: H(n), scores: {}, soloResults: {},
  simSplit: 'performance', simTeams: null, format: 'custom', durationMin: 180, plan, lockedRounds: [], breaks: [], ...over,
});
const play = (t: Training) => buildSchedule(t).sections.flatMap((s) => s.rows).filter((r) => r.kind !== 'break');
const groupsOf = (r: ScheduleRow) => r.cells.flatMap((c) => (c?.type === 'group' ? [c.players] : []));

describe('nová cvičení (2. 11. 2026)', () => {
  it('Penalta z místa se dělí na proti brankáři a bez brankáře; stará (20 střel) jen v historii', () => {
    expect(discipline('setShooting').retired).toBe(true);
    expect(discipline('penaltyKeeper')).toMatchObject({ name: 'Penalta z místa proti brankáři', kind: 'drill', metric: 'penaltyKeeper', needsPartner: true });
    expect(discipline('penaltySolo')).toMatchObject({ name: 'Penalta z místa bez brankáře', kind: 'drill', metric: 'penaltySolo' });
    expect(discipline('backShotKeeper')).toMatchObject({ name: 'Střela z dvojky proti brankáři', needsPartner: true });
    expect(discipline('backShotSolo')).toMatchObject({ name: 'Střela z dvojky bez brankáře' });
    expect(discipline('passWallLane')).toMatchObject({ name: 'Přihrávky ke zdi a po lajně', variants: ['ke zdi', 'po lajně'] });
    expect(discipline('warmupPasses').retired).toBeFalsy(); // původní přihrávky (kamkoliv, s bránícím) zůstávají
    for (const id of ['penaltyKeeper', 'penaltySolo', 'backShotKeeper', 'backShotSolo', 'passWallLane'] as const) {
      expect(discipline(id).variants).toHaveLength(2);
      expect(soloMetric(discipline(id).metric!).max).toBe(10); // 2 kola po 10 = celkem 20
    }
    expect(soloMetric('fiveBarSolo')).toMatchObject({ name: 'Udržení míče na pětce – sólo', max: 10, lowerIsBetter: true });
    // výchozí výběr: penalta proti brankáři místo staré; sólové a nové volitelné
    expect(DEFAULT_SELECTION).toContain('penaltyKeeper');
    expect(DEFAULT_SELECTION).not.toContain('setShooting');
    for (const id of ['penaltySolo', 'backShotSolo', 'backShotKeeper', 'passWallLane'] as const) expect(DEFAULT_SELECTION).not.toContain(id);
    expect(DISCIPLINES.filter((d) => d.kind === 'drill' && !d.retired).map((d) => d.id)).toEqual([
      'warmup', 'warmupPasses', 'passWallLane', 'fiveBarControl', 'penaltyKeeper', 'penaltySolo', 'backShotKeeper', 'backShotSolo', 'clearing', 'looseBall', 'chain',
    ]);
  });

  it('nový trénink po tréninku se starou Penaltou dostane Penaltu proti brankáři', () => {
    const tpl = { id: 's', name: 'Stará', durationMin: 180, selection: ['setShooting', 'normal'] as DisciplineId[] };
    expect(newTraining('n', '2026-11-03', null, null, tpl).plan.penaltyKeeper).toBeGreaterThanOrEqual(2);
  });

  it('cvičení na dvě varianty: vždy po dvou kolech, ve druhém stejné skupiny; varianta v pravidle kola', () => {
    expect(autoPlan(['passWallLane'], 180, 8, 4).passWallLane).toBe(2);
    expect(autoPlan(['penaltyKeeper'], 180, 13, 2).penaltyKeeper).toBe(8); // 4 kola na vystřídání × 2 varianty
    const r = play(custom(8, 4, { passWallLane: 2 }));
    expect(r[0].rule).toMatch(/^Přihrávky ke zdi a po lajně – ke zdi, 4 min/);
    expect(r[1].rule).toMatch(/^Přihrávky ke zdi a po lajně – po lajně, 4 min/);
    expect(groupsOf(r[1])).toEqual(groupsOf(r[0]));
    const p = play(custom(8, 4, { penaltyKeeper: 2 }));
    expect(p.map((x) => x.rule)).toEqual(['Penalta z místa proti brankáři – varianta 1, 4 min', 'Penalta z místa proti brankáři – varianta 2, 4 min']);
    // každé kolo má vlastní výsledek (klíč s číslem kola)
    expect(p.map((x) => (x.cells[0] as { soloRound?: number }).soloRound)).toEqual([1, 2]);
  });
});

describe('trénink pro 1 hráče', () => {
  it('jde založit; hrají se jen cvičení bez soupeře, skupina o 1 hráči', () => {
    const t = custom(1, 1, { passWallLane: 2, penaltySolo: 2, fiveBarControl: 1, penaltyKeeper: 2, warmupPasses: 1, normal: 2, sim: 1 });
    expect(canBuildSchedule(t)).toBe(true);
    const r = play(t);
    expect(r.map((x) => x.discipline)).toEqual(['passWallLane', 'passWallLane', 'fiveBarControl', 'penaltySolo', 'penaltySolo']);
    for (const x of r) expect(groupsOf(x)).toEqual([['H1']]);
    // Udržení míče na pětce sólo se zapisuje do vlastní tabulky
    expect(r[2].cells[0]).toMatchObject({ type: 'group', metric: 'fiveBarSolo' });
    expect(r[0].cells[0]).toMatchObject({ type: 'group', metric: 'passWallLane' });
    // čas počítá jen to, co se hraje
    expect(plannedMinutes(t.plan, 1, [])).toBe(29); // 4 kola po 4+1, Udržení 8+1
  });

  it('se 2 a víc hráči je Udržení míče na pětce s bránícím (původní metrika)', () => {
    const r = play(custom(2, 1, { fiveBarControl: 1 }));
    expect(r[0].cells[0]).toMatchObject({ type: 'group', metric: 'fiveBarControl' });
    expect(groupsOf(r[0]).map((g) => [...g].sort())).toEqual([['H1', 'H2']]);
  });

  it('přechod na 1 hráče vybere sólová cvičení', () => {
    const before = custom(2, 1, autoPlan(DEFAULT_SELECTION, 120, 2, 1));
    const after = replan(before, { ...before, attendees: H(1) });
    for (const id of SOLO_SELECTION) expect(after.plan[id] ?? 0).toBeGreaterThan(0);
    expect(play(after).every((x) => x.kind === 'groups')).toBe(true);
    expect(plannedMinutes(after.plan, 1, [])).toBeLessThanOrEqual(120);
  });

  it('zpátky na víc hráčů: sólová cvičení přidaná pro 1 hráče se zase odeberou (průvodce zaškrtává hráče postupně)', () => {
    const zero = { ...custom(0, 4, autoPlan(DEFAULT_SELECTION, 180, 0, 4)), disciplineOrder: DEFAULT_SELECTION };
    const one = replan(zero, { ...zero, attendees: H(1) });
    const eight = replan(one, { ...one, attendees: H(8) });
    for (const id of ['penaltySolo', 'backShotSolo', 'passWallLane'] as const) expect(eight.plan[id] ?? 0).toBe(0);
    // bez doplňování (9. 11. 2026): zápasy si nechají počet kol, cvičení podle přítomných
    expect(eight.plan).toEqual(manualPlan(DEFAULT_SELECTION, 8, 4, zero.plan));
  });

  it('zpátky na víc hráčů s šablonou: výběr se vrátí přesně na šablonu (i nevolitelná / volitelná sólová)', () => {
    const selection: DisciplineId[] = ['passWallLane', 'normal', 'wall'];
    const zero = { ...custom(0, 4, manualPlan(selection, 0, 4)), disciplineOrder: selection };
    const one = replan(zero, { ...zero, attendees: H(1) });
    expect(one.plan.fiveBarControl ?? 0).toBeGreaterThan(0);
    const eight = replan(one, { ...one, attendees: H(8) });
    expect(selectedDisciplines(eight.plan).sort()).toEqual([...selection].sort());
  });
});


describe('Clearing (3. 11. 2026)', () => {
  it('cvičení pro dva na dvě varianty po 10; brání soupeř trojkou i pětkou; povedený = míč za pětkou', () => {
    expect(discipline('clearing')).toMatchObject({ kind: 'drill', name: 'Clearing', min: 4, metric: 'clearing', variants: ['varianta 1', 'varianta 2'], needsPartner: true });
    expect(soloMetric('clearing')).toMatchObject({ what: 'míče za pětku z 10', max: 10, lowerIsBetter: false, ok: 'za pětkou', fail: 'zachycený' });
    const r = play(custom(4, 1, { clearing: 2 }));
    expect(r.map((x) => x.rule)).toEqual(['Clearing – varianta 1, 4 min', 'Clearing – varianta 2, 4 min']);
    // sám ho hráč hrát nemůže
    expect(play(custom(1, 1, { clearing: 2, passWallLane: 2 })).every((x) => x.discipline !== 'clearing')).toBe(true);
  });
});

describe('Zachycení volného míče (3. 11. 2026)', () => {
  it('pro dva, 1. kolo míče po zdi, 2. kolo středem, po 10; stačí dostat míč pod kontrolu', () => {
    expect(discipline('looseBall')).toMatchObject({ kind: 'drill', name: 'Zachycení volného míče', min: 4, metric: 'looseBall', variants: ['po zdi', 'středem'], needsPartner: true });
    expect(soloMetric('looseBall')).toMatchObject({ what: 'míče pod kontrolou z 10', max: 10, lowerIsBetter: false, ok: 'pod kontrolou', fail: 'nezachycený' });
    const r = play(custom(4, 1, { looseBall: 2 }));
    expect(r.map((x) => x.rule)).toEqual(['Zachycení volného míče – po zdi, 4 min', 'Zachycení volného míče – středem, 4 min']);
  });
});

it('Obrana do držení je úplně odstraněná (3. 11. 2026): není v katalogu ani mezi metrikami cvičení', () => {
  expect(DISCIPLINES.some((d) => (d.id as string) === 'blockToControl')).toBe(false);
  expect(DEFAULT_SELECTION as string[]).not.toContain('blockToControl');
  expect(SOLO_METRICS.some((m) => m.name === 'Obrana do držení')).toBe(false);
});
