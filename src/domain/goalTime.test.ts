import { catalogGoalSec, catalogRoundMin, DEFAULT_GOAL_SEC, goalRoundMin, goalSecOf, maxGoals, roundMinutes } from './goalTime';
import { goalAverages, goalSamples } from './goalStats';
import { applyCatalog, catalogForm, saveDiscipline, validateDisciplineForm } from './catalog';
import { formatOf, legId, SIM_FORMATS } from './matchFormat';
import { buildSchedule } from './schedule';
import { newTraining } from './training';
import type { DisciplineId, Training } from './types';
import { H } from '../test/fixtures';

/**
 * Délka kola z doby gólu (18. 11. 2026, *rozhodnutí uživatele*): doba gólu × nejvíc možných gólů ve
 * formátu, nahoru na celé minuty. Výchozí doba gólu stejná pro všechny disciplíny, admin ji přepíše.
 */
describe('nejvíc možných gólů', () => {
  const one = (id: DisciplineId) => maxGoals(id, formatOf(null, id));
  it('leg do 6 = 11 gólů (6:5); scénáře jen odehrané góly', () => {
    for (const id of ['normal', 'lossTax', 'wall', 'singles', 'goalieWar', 'penalty6'] as DisciplineId[]) expect(one(id)).toBe(11);
    expect(one('start03')).toBe(8); // 0:3 → 6:5
    expect(one('start44')).toBe(3); // 4:4 → 6:5
    expect(one('start45')).toBe(2); // 4:5 → 6:5 i 5:6
    expect(one('start55')).toBe(9); // 5:5 → 10:9 (o 2, strop 10)
  });

  it('BO formát: všechny legy, rozhodující o 2 do stropu', () => {
    expect(maxGoals('normal', { bestOf: 2, legTo: 6 })).toBe(22);
    expect(maxGoals('normal', { bestOf: 3, legTo: 5 })).toBe(27);
    expect(maxGoals('normal', { bestOf: 3, legTo: 6, finalWinBy2: true, cap: 10 })).toBe(11 + 11 + 19);
    expect(maxGoals('start44', { bestOf: 2, legTo: 6 })).toBe(6);
    expect(maxGoals('normal', { bestOf: 1, legTo: 6, finalWinBy2: true, cap: 8 })).toBe(15);
  });

  it('simulace: jeden zápas vlny ve formátu simulace', () => {
    expect(maxGoals('sim', SIM_FORMATS[0])).toBe(41); // BO3 do 6: 11 + 11 + 19
    expect(maxGoals('sim', SIM_FORMATS[1])).toBe(55); // BO5 do 5: 4 × 9 + 19
  });
});

describe('délka kola z doby gólu', () => {
  it('nahoru na celé minuty, aspoň 1; simulace = 2 vlny', () => {
    expect(goalRoundMin('normal', formatOf(null, 'normal'), 37)).toBe(7); // 407 s
    expect(goalRoundMin('start45', formatOf(null, 'start45'), 30)).toBe(1); // 60 s
    expect(goalRoundMin('start45', formatOf(null, 'start45'), 31)).toBe(2); // 62 s
    expect(goalRoundMin('start45', formatOf(null, 'start45'), 5)).toBe(1);
    expect(goalRoundMin('sim', SIM_FORMATS[0], 37)).toBe(2 * 26); // 1517 s na vlnu
    expect(goalRoundMin('sim', SIM_FORMATS[1], 37)).toBe(2 * 34); // 2035 s na vlnu
  });

  it('výchozí doba gólu stejná pro všechny zápasy a simulaci; v katalogu jen zápasy a simulace', () => {
    expect(DEFAULT_GOAL_SEC).toBe(40);
    const snap = catalogGoalSec();
    expect(snap.normal).toBe(40);
    expect(snap.sim).toBe(40);
    expect(snap.warmupPasses).toBeUndefined();
    expect(catalogRoundMin('start44')).toBe(2);
    expect(catalogRoundMin('warmupPasses')).toBe(8); // cvičení dál z délky kola
  });

  it('katalog (stránka Disciplíny) počítá vždy jako BO1 do 6, i simulaci; trénink podle svého formátu', () => {
    expect(catalogRoundMin('normal')).toBe(8); // 11 × 40 s = 440 s
    expect(catalogRoundMin('start55')).toBe(6); // ze 5:5 o 2, strop 10: 9 gólů = 360 s
    expect(catalogRoundMin('sim')).toBe(2 * 8); // 2 vlny, zápas BO1 do 6 = 11 gólů
    expect(roundMinutes({}, { normal: { bestOf: 3, legTo: 6 } }, { normal: 37, sim: 37 })).toMatchObject({ normal: 21, sim: 52 });
  });

  it('roundMinutes: s dobou gólu z gólů; bez ní jako dřív (délka legu × legy, simulace beze změny)', () => {
    const mins = { normal: 8, sim: 40, warmupPasses: 8 };
    const formats = { normal: { bestOf: 2, legTo: 6 } };
    expect(roundMinutes(mins, formats, null)).toEqual({ normal: 16, sim: 40, warmupPasses: 8 });
    expect(roundMinutes(mins, formats, { normal: 37, sim: 37 })).toEqual({ normal: 14, sim: 52, warmupPasses: 8 });
    // neplatná doba gólu se ignoruje
    expect(roundMinutes(mins, null, { normal: 0 })).toEqual(mins);
  });
});

describe('trénink s dobou gólu', () => {
  const base = (over: Partial<Training> = {}): Training => ({
    id: 't', date: '2026-11-18', startTime: '18:00', mode: 'team', tables: 4, attendees: H(8), scores: {}, soloResults: {},
    simSplit: 'order', simTeams: null, format: 'custom', durationMin: 180, plan: { normal: 1, start44: 1, sim: 1 }, lockedRounds: [], breaks: [],
    disciplineMin: { normal: 8, start44: 5, sim: 40 }, ...over,
  });
  const rows = (t: Training) => buildSchedule(t).sections.flatMap((s) => s.rows).filter((r) => r.kind !== 'break');

  it('nový trénink si uloží doby gólů z katalogu', () => {
    expect(newTraining('t', '2026-11-18', null).goalSec).toEqual(catalogGoalSec());
  });

  it('časy kol z gólů; vlny simulace po polovině kola', () => {
    const r = rows(base({ goalSec: { normal: 37, start44: 37, sim: 37 } }));
    expect(r.map((x) => [x.label, x.time])).toEqual([['1. kolo', 0], ['2. kolo', 8], ['1. vlna', 11], ['2. vlna', 37]]);
    expect(r[0].rule).toBe('Normální leg, 7 min');
    expect(r[1].rule).toBe('Start 4:4, 2 min');
    expect(r[2].rule).toMatch(/^26 min, BO3/);
  });

  it('starší trénink bez doby gólu má časy jako dřív', () => {
    const r = rows(base());
    expect(r.map((x) => [x.label, x.time])).toEqual([['1. kolo', 0], ['2. kolo', 9], ['1. vlna', 15], ['2. vlna', 35]]);
    expect(r[2].rule).toMatch(/^20 min, BO3/);
  });
});

describe('doba gólu v katalogu (admin)', () => {
  it('admin zadá dobu gólu u zápasu; délka kola se z ní spočítá; prázdná = výchozí', () => {
    const f = catalogForm('start55');
    expect(f.goalSec).toBeNull();
    const data = saveDiscipline({}, 'start55', { ...f, goalSec: 30 });
    expect(data).toEqual({ disciplines: { start55: { goalSec: 30 } } });
    applyCatalog(data);
    expect(goalSecOf('start55')).toBe(30);
    expect(goalSecOf('normal')).toBe(DEFAULT_GOAL_SEC);
    expect(catalogRoundMin('start55')).toBe(5); // 9 × 30 s = 270 s
    expect(catalogForm('start55', data).goalSec).toBe(30);
    expect(saveDiscipline(data, 'start55', { ...catalogForm('start55', data), goalSec: null })).toEqual({});
  });

  it('kontrola: 5–300 celých sekund; u cvičení se doba gólu neukládá', () => {
    expect(validateDisciplineForm({ ...catalogForm('normal'), goalSec: 4 })).toBe('Doba gólu musí být 5–300 s (celé sekundy).');
    expect(validateDisciplineForm({ ...catalogForm('normal'), goalSec: 30.5 })).toBe('Doba gólu musí být 5–300 s (celé sekundy).');
    expect(validateDisciplineForm({ ...catalogForm('normal'), goalSec: 300 })).toBeNull();
    expect(saveDiscipline({}, 'warmupPasses', { ...catalogForm('warmupPasses'), goalSec: 30 })).toEqual({});
  });

  it('dřívější ruční délka kola zápasu se ignoruje a při uložení zmizí', () => {
    const data = { disciplines: { lossTax: { min: 5 } } };
    applyCatalog(data);
    expect(catalogRoundMin('lossTax')).toBe(8);
    expect(saveDiscipline(data, 'lossTax', catalogForm('lossTax', data))).toEqual({});
  });
});

describe('reálná doba gólu z průběhu her', () => {
  const T0 = Date.UTC(2026, 10, 17, 17, 0);
  const s = (sec: number) => T0 + sec * 1000;
  const t = (): Training => {
    const tr: Training = {
      id: 'r', date: '2026-11-17', startTime: '18:00', mode: 'team', tables: 4, attendees: H(8), scores: {}, soloResults: {},
      simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan: { normal: 1, start44: 1 }, lockedRounds: [], breaks: [],
      disciplineMin: { normal: 8, start44: 5 }, matchFormats: { normal: { bestOf: 2, legTo: 6 } },
    };
    const [n1, n2, s1] = buildSchedule(tr).matches;
    return {
      ...tr,
      scores: { [n1.id]: { ga: 6, gb: 4 }, [legId(n1.id, 2)]: { ga: 6, gb: 4 }, [n2.id]: { ga: 6, gb: 0 }, [s1.id]: { ga: 2, gb: 1 } },
      events: [
        { id: 'a', itemId: n1.id, at: s(10), kind: 'goal', side: 'A', delta: 1 },
        { id: 'b', itemId: n1.id, at: s(5), kind: 'loss', side: 'A', delta: 1 }, // ztráta není gól
        { id: 'c', itemId: legId(n1.id, 2), at: s(300), kind: 'goal', side: 'B', delta: 1 },
        { id: 'd', itemId: n2.id, at: s(20), kind: 'goal', side: 'A', delta: 1 },
        { id: 'e', itemId: s1.id, at: s(600), kind: 'goal', side: 'A', delta: 1 },
      ],
      playTimes: {
        [n1.id]: { startedAt: s(0), endedAt: s(810) }, // 800 s / 20 gólů = 40 s
        [n2.id]: { startedAt: s(0) }, // bez ukončení se nepočítá
        [s1.id]: { startedAt: s(590), endedAt: s(690) }, // 90 s / 3 góly = 30 s
      },
    };
  };

  it('od prvního gólu (kterýkoli leg) do ukončení utkání, děleno všemi odehranými góly', () => {
    expect(goalSamples([t()])).toEqual([
      { discipline: 'normal', secPerGoal: 40 },
      { discipline: 'start44', secPerGoal: 30 },
    ]);
  });

  it('průměr celkově a po disciplínách; jiné než klubové tréninky a tréninky bez průběhu se nepočítají', () => {
    expect(goalAverages([t(), { ...t(), id: 'p', format: 'practice' }, { ...t(), id: 'x', events: [] }])).toEqual({
      all: { sec: 35, matches: 2 },
      by: { normal: { sec: 40, matches: 1 }, start44: { sec: 30, matches: 1 } },
    });
    expect(goalAverages([])).toEqual({ all: null, by: {} });
  });
});
