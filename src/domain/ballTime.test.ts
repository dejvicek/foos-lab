import { catalogBallSec, catalogRoundMin, catalogSimMins, DEFAULT_DRILL_BALL_SEC, drillBalls, drillRoundMin, DEFAULT_BALL_SEC, goalRoundMin, ballSecOf, maxGoals, roundMinutes } from './ballTime';
import { ballAverages, ballSamples } from './ballStats';
import { applyCatalog, catalogForm, saveDiscipline, validateDisciplineForm } from './catalog';
import { formatOf, legId, SIM_FORMATS } from './matchFormat';
import { buildSchedule } from './schedule';
import { newTraining } from './training';
import { newPractice } from './practice';
import { drillItemId } from './queue';
import type { DisciplineId, Training } from './types';
import { H } from '../test/fixtures';

/**
 * Délka kola z doby míčku (18. 11. 2026, *rozhodnutí uživatele*): doba míčku × nejvíc možných gólů ve
 * formátu, nahoru na celé minuty. Výchozí doba míčku stejná pro všechny disciplíny, admin ji přepíše.
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
    expect(maxGoals('sim', SIM_FORMATS[1])).toBe(51); // BO5 do 5, strop 8: 4 × 9 + 15
  });
});

describe('délka kola z doby míčku', () => {
  it('nahoru na celé minuty, aspoň 1; simulace = 2 vlny', () => {
    expect(goalRoundMin('normal', formatOf(null, 'normal'), 37)).toBe(7); // 407 s
    expect(goalRoundMin('start45', formatOf(null, 'start45'), 30)).toBe(1); // 60 s
    expect(goalRoundMin('start45', formatOf(null, 'start45'), 31)).toBe(2); // 62 s
    expect(goalRoundMin('start45', formatOf(null, 'start45'), 5)).toBe(1);
    expect(goalRoundMin('sim', SIM_FORMATS[0], 37)).toBe(2 * 26); // 1517 s na vlnu
    expect(goalRoundMin('sim', SIM_FORMATS[1], 37)).toBe(2 * 32); // 1887 s na vlnu
  });

  it('výchozí doba míčku: zápasy a simulace 40 s, cvičení s pokusy 20 s; Rozcvička a Čistá desítka bez ní', () => {
    expect(DEFAULT_BALL_SEC).toBe(40);
    expect(DEFAULT_DRILL_BALL_SEC).toBe(20);
    const snap = catalogBallSec();
    expect(snap.normal).toBe(40);
    expect(snap.sim).toBe(40);
    expect(snap.warmupPasses).toBe(20);
    expect(snap.penaltySolo).toBe(20);
    expect(snap.chain).toBe(30); // Řetězec 30 s (18. 11. 2026)
    expect(catalogRoundMin('chain')).toBe(20); // 30 s × 40 pokusů = 1200 s
    expect(snap.warmup).toBeUndefined();
    expect(snap.streakShot3).toBeUndefined();
    expect(catalogRoundMin('start44')).toBe(2);
    expect(catalogRoundMin('warmup')).toBe(9);
    expect(catalogRoundMin('streakShot3')).toBe(10);
  });

  it('cvičení: míčky v kole = pokusy hráče, ve dvojici (s bránícím soupeřem) každý svůj počet', () => {
    expect(drillBalls('warmupPasses')).toBe(40);
    expect(drillBalls('fiveBarControl')).toBe(40); // 2 × 20 sérií
    expect(drillBalls('chain')).toBe(40);
    expect(drillBalls('penaltySolo')).toBe(20);
    expect(drillBalls('passWallLane')).toBe(20);
    expect(drillBalls('warmup')).toBe(0);
    expect(drillBalls('streakShot3')).toBe(0);
    expect(drillRoundMin('warmupPasses', 20)).toBe(14); // 800 s
    expect(drillRoundMin('penaltySolo', 20)).toBe(7); // 400 s
    expect(roundMinutes({ warmupPasses: 8, warmup: 9 }, null, { warmupPasses: 15 })).toEqual({ warmupPasses: 10, warmup: 9 });
  });

  it('katalog (stránka Disciplíny) počítá zápasy jako BO1 do 6, simulaci v obou jejích formátech; trénink podle svého formátu', () => {
    expect(catalogRoundMin('normal')).toBe(8); // 11 × 40 s = 440 s
    expect(catalogRoundMin('start55')).toBe(6); // ze 5:5 o 2, strop 10: 9 gólů = 360 s
    // simulace: oba její formáty (18. 11. 2026) – BO3 do 6 strop 10 = 41 gólů, BO5 do 5 strop 8 = 51 gólů
    expect(catalogRoundMin('sim')).toBe(2 * 28);
    expect(catalogSimMins()).toEqual([
      { format: SIM_FORMATS[0], wave: 28, min: 56 },
      { format: SIM_FORMATS[1], wave: 34, min: 68 },
    ]);
    expect(roundMinutes({}, { normal: { bestOf: 3, legTo: 6 } }, { normal: 37, sim: 37 })).toMatchObject({ normal: 21, sim: 52 });
  });

  it('roundMinutes: s dobou míčku z gólů; bez ní jako dřív (délka legu × legy, simulace beze změny)', () => {
    const mins = { normal: 8, sim: 40, warmupPasses: 8 };
    const formats = { normal: { bestOf: 2, legTo: 6 } };
    expect(roundMinutes(mins, formats, null)).toEqual({ normal: 16, sim: 40, warmupPasses: 8 });
    expect(roundMinutes(mins, formats, { normal: 37, sim: 37 })).toEqual({ normal: 14, sim: 52, warmupPasses: 8 });
    // neplatná doba míčku se ignoruje
    expect(roundMinutes(mins, null, { normal: 0 })).toEqual(mins);
  });
});

describe('trénink s dobou míčku', () => {
  const base = (over: Partial<Training> = {}): Training => ({
    id: 't', date: '2026-11-18', startTime: '18:00', mode: 'team', tables: 4, attendees: H(8), scores: {}, soloResults: {},
    simSplit: 'order', simTeams: null, format: 'custom', durationMin: 180, plan: { normal: 1, start44: 1, sim: 1 }, lockedRounds: [], breaks: [],
    disciplineMin: { normal: 8, start44: 5, sim: 40 }, ...over,
  });
  const rows = (t: Training) => buildSchedule(t).sections.flatMap((s) => s.rows).filter((r) => r.kind !== 'break');

  it('nový trénink si uloží doby míčků z katalogu', () => {
    expect(newTraining('t', '2026-11-18', null).ballSec).toEqual(catalogBallSec());
  });

  it('časy kol z gólů; vlny simulace po polovině kola', () => {
    const r = rows(base({ ballSec: { normal: 37, start44: 37, sim: 37 } }));
    expect(r.map((x) => [x.label, x.time])).toEqual([['1. kolo', 0], ['2. kolo', 8], ['1. vlna', 11], ['2. vlna', 37]]);
    expect(r[0].rule).toBe('Normální leg, 7 min');
    expect(r[1].rule).toBe('Start 4:4, 2 min');
    expect(r[2].rule).toMatch(/^26 min, BO3/);
  });

  it('starší trénink bez doby míčku má časy jako dřív', () => {
    const r = rows(base());
    expect(r.map((x) => [x.label, x.time])).toEqual([['1. kolo', 0], ['2. kolo', 9], ['1. vlna', 15], ['2. vlna', 35]]);
    expect(r[2].rule).toMatch(/^20 min, BO3/);
  });
});

describe('doba míčku v katalogu (admin)', () => {
  it('admin zadá dobu míčku u zápasu; délka kola se z ní spočítá; prázdná = výchozí', () => {
    const f = catalogForm('start55');
    expect(f.ballSec).toBeNull();
    const data = saveDiscipline({}, 'start55', { ...f, ballSec: 30 });
    expect(data).toEqual({ disciplines: { start55: { ballSec: 30 } } });
    applyCatalog(data);
    expect(ballSecOf('start55')).toBe(30);
    expect(ballSecOf('normal')).toBe(DEFAULT_BALL_SEC);
    expect(catalogRoundMin('start55')).toBe(5); // 9 × 30 s = 270 s
    expect(catalogForm('start55', data).ballSec).toBe(30);
    expect(saveDiscipline(data, 'start55', { ...catalogForm('start55', data), ballSec: null })).toEqual({});
  });

  it('kontrola: 5–300 celých sekund; u Rozcvičky a Čisté desítky se doba míčku neukládá', () => {
    expect(validateDisciplineForm({ ...catalogForm('normal'), ballSec: 4 })).toBe('Doba míčku musí být 5–300 s (celé sekundy).');
    expect(validateDisciplineForm({ ...catalogForm('normal'), ballSec: 30.5 })).toBe('Doba míčku musí být 5–300 s (celé sekundy).');
    expect(validateDisciplineForm({ ...catalogForm('normal'), ballSec: 300 })).toBeNull();
    expect(saveDiscipline({}, 'warmup', { ...catalogForm('warmup'), ballSec: 30 })).toEqual({});
    expect(saveDiscipline({}, 'streakShot3', { ...catalogForm('streakShot3'), ballSec: 30 })).toEqual({});
    expect(saveDiscipline({}, 'warmupPasses', { ...catalogForm('warmupPasses'), ballSec: 30 })).toEqual({ disciplines: { warmupPasses: { ballSec: 30 } } });
  });

  it('dřívější ruční délka kola zápasu se ignoruje a při uložení zmizí', () => {
    const data = { disciplines: { lossTax: { min: 5 } } };
    applyCatalog(data);
    expect(catalogRoundMin('lossTax')).toBe(8);
    expect(saveDiscipline(data, 'lossTax', catalogForm('lossTax', data))).toEqual({});
  });
});

describe('reálná doba míčku z průběhu her', () => {
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
    expect(ballSamples([t()])).toEqual([
      { discipline: 'normal', sec: 40 },
      { discipline: 'start44', sec: 30 },
    ]);
  });

  it('průměr celkově a po disciplínách; jiné než klubové tréninky a tréninky bez průběhu se nepočítají', () => {
    expect(ballAverages([t(), { ...t(), id: 'x', events: [] }])).toEqual({
      matches: { sec: 35, n: 2 },
      drills: null,
      by: { normal: { sec: 40, n: 1 }, start44: { sec: 30, n: 1 } },
    });
    expect(ballAverages([])).toEqual({ matches: null, drills: null, by: {} });
  });
});

describe('reálná doba míčku cvičení a celkový čas Čisté desítky', () => {
  const T0 = Date.UTC(2026, 10, 17, 17, 0);
  const s = (sec: number) => T0 + sec * 1000;

  it('klubové cvičení: od prvního pokusu do ukončení kola u stolu, děleno ťuknutými pokusy (Zpět se nepočítá)', () => {
    const base: Training = {
      id: 'd', date: '2026-11-17', startTime: '18:00', mode: 'team', tables: 2, attendees: H(4), scores: {}, soloResults: {},
      simSplit: 'order', simTeams: null, format: 'custom', durationMin: 60, plan: { warmupPasses: 1 }, lockedRounds: [], breaks: [],
    };
    const row = buildSchedule(base).sections.flatMap((x) => x.rows).find((r) => r.kind === 'groups')!;
    const cell = row.cells[0]!;
    const item = drillItemId(row, 1, cell.type === 'group' ? cell.players : []);
    const tap = (id: string, at: number, kind: 'hit' | 'miss', delta: 1 | -1 = 1) => ({ id, itemId: item, at: s(at), kind, playerId: 'H1', delta });
    const t: Training = {
      ...base,
      events: [tap('a', 10, 'hit'), tap('b', 30, 'miss'), tap('c', 50, 'hit'), tap('d', 60, 'hit'), tap('e', 61, 'hit', -1)],
      playTimes: { [item]: { startedAt: s(0), endedAt: s(70) } }, // 60 s / 3 pokusy = 20 s
    };
    expect(ballSamples([t])).toEqual([{ discipline: 'warmupPasses', sec: 20 }]);
    expect(ballAverages([t])).toMatchObject({ matches: null, drills: { sec: 20, n: 1 } });
  });

  it('vlastní trénink: kolo cvičení podle ukončení kola; Čistá desítka = průměr časů splnění (nesplněné ne)', () => {
    const p = newPractice('p', '2026-11-12', '18:00', 'A', null, ['penaltySolo', 'streakShot3']);
    const t: Training = {
      ...p,
      events: [
        { id: 'a', itemId: 'round|1', at: s(5), kind: 'hit', playerId: 'A', delta: 1 },
        { id: 'b', itemId: 'round|1', at: s(25), kind: 'miss', playerId: 'A', delta: 1 },
      ],
      playTimes: { 'round|1': { startedAt: s(0), endedAt: s(45) } }, // 40 s / 2 pokusy
      soloResults: { A: { 'streakShot3@3': 180, 'streakShot3@4': 0 }, B: { 'streakShot3@3': 240 } },
    };
    const r = ballAverages([t]);
    expect(r.by.penaltySolo).toEqual({ sec: 20, n: 1 });
    expect(r.by.streakShot3).toEqual({ sec: 210, n: 2 });
    expect(r.drills).toEqual({ sec: 20, n: 1 }); // Čistá desítka do průměru cvičení nepatří
  });
});
