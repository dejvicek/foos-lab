import { buildSchedule } from './schedule';
import { applyCatalog } from './catalog';
import { attendance, lastTraining } from './attendance';
import { computeSoloLadder } from './soloLadder';
import {
  clubTrainings,
  isClub,
  isPractice,
  newPractice,
  canAdvance,
  currentRound,
  practiceDrills,
  practiceEnded,
  practiceMetric,
  practiceRunning,
  practiceSeries,
  practicesFor,
  seriesDrill,
  practicePlanMinutes,
  practiceRounds,
  roundRemainingSec,
  roundTimes, computePracticeMatchLadder } from './practice';
import { drillSections } from './disciplines';
import { discipline } from './disciplines';
import { setAttempts, setSolo } from './training';
import { training } from '../test/fixtures';
import type { Training } from './types';

const TODAY = '2026-11-11';
const HOUR = 3_600_000;

afterEach(() => applyCatalog({}));

/** Vlastní trénink s výsledky [hráč, klíč, hodnota]. */
const practice = (id: string, date: string, players: string[], vals: [string, string, number][] = []): Training =>
  vals.reduce((t, [p, k, v]) => setSolo(t, p, k, v), newPractice(id, date, '17:30', players[0], players[1] ?? null));

describe('newPractice (PRD 5.11)', () => {
  it('sám: jeden hráč, formát practice, zakladatel = hráč', () => {
    const t = newPractice('p1', TODAY, '17:30', 'A');
    expect(t).toMatchObject({ id: 'p1', date: TODAY, startTime: '17:30', format: 'practice', attendees: ['A'], createdBy: 'A', tables: 1, mode: 'single' });
    expect(isPractice(t)).toBe(true);
    expect(isClub(t)).toBe(false);
  });

  it('ve dvou: zakladatel první; spoluhráč stejný jako zakladatel se nepřidá', () => {
    expect(newPractice('p', TODAY, '17:30', 'A', 'B').attendees).toEqual(['A', 'B']);
    expect(newPractice('p', TODAY, '17:30', 'A', 'A').attendees).toEqual(['A']);
  });

  it('klubový trénink není vlastní', () => {
    expect(isClub(training('t', TODAY, 'team', ['A', 'B', 'C', 'D']))).toBe(true);
  });
});

describe('nabídka cvičení', () => {
  it('sám: jen cvičení bez bránícího soupeře (a Rozcvička), bez vyřazených', () => {
    const ids = practiceDrills(1).map((d) => d.id);
    // Udržení míče na pětce od 12. 11. 2026 jen klub a duo
    expect(ids).toEqual(['warmup', 'passWallLane', 'penaltySolo', 'backShotSolo', 'streakShot3', 'streakPass5', 'streakShot2', 'streakPass2']);
  });

  it('ve dvou: i cvičení s bránícím soupeřem; vyřazená ne', () => {
    const ids = practiceDrills(2).map((d) => d.id);
    expect(ids).toContain('warmupPasses');
    expect(ids).toContain('penaltyKeeper');
    expect(ids).toContain('chain');
    expect(ids).not.toContain('setShooting');
    expect(ids).not.toContain('backRodsBuildUp');
    // zápasy a scénáře ve dvou (12. 11. 2026), simulace ne
    // v duu Jedničky (1 na 1), Normální leg jen v klubu; „bez brankáře“ jen solo
    expect(ids.filter((id) => discipline(id).kind === 'match')).toEqual(['lossTax', 'wall', 'start03', 'start44', 'start45', 'start55', 'singles', 'goalieWar', 'penalty6']);
    expect(ids).not.toContain('penaltySolo');
    expect(ids).not.toContain('backShotSolo');
    expect(ids).not.toContain('sim');
    expect(practiceDrills(1).some((d) => d.kind === 'match')).toBe(false);
  });

  it('sekce Obrana / Pětka / Trojka (12. 11. 2026): Rozcvička bez sekce nahoře, uvnitř pořadí katalogu', () => {
    const g = drillSections(practiceDrills(1)).map((x) => [x.name, x.drills.map((d) => d.id)]);
    expect(g).toEqual([
      [null, ['warmup']],
      ['Obrana', ['backShotSolo', 'streakShot2', 'streakPass2']],
      ['Pětka', ['passWallLane', 'streakPass5']],
      ['Trojka', ['penaltySolo', 'streakShot3']],
    ]);
    const pair = drillSections(practiceDrills(2));
    expect(pair.find((x) => x.area === 'defense')!.drills.map((d) => d.id)).toEqual(['backShotKeeper', 'clearing', 'looseBall', 'streakShot2', 'streakPass2']);
    expect(pair.find((x) => x.area === 'threeBar')!.drills.map((d) => d.id)).toContain('chain');
    expect(drillSections([discipline('penaltySolo')]).map((x) => x.name)).toEqual(['Trojka']);
  });

  it('Udržení míče na pětce sám → fiveBarSolo, ve dvou → fiveBarControl; Rozcvička bez metriky', () => {
    expect(practiceMetric(discipline('fiveBarControl'), 1)).toBe('fiveBarSolo');
    expect(practiceMetric(discipline('fiveBarControl'), 2)).toBe('fiveBarControl');
    expect(practiceMetric(discipline('penaltySolo'), 1)).toBe('penaltySolo');
    expect(practiceMetric(discipline('warmup'), 1)).toBeUndefined();
  });

  it('názvy z katalogu admina', () => {
    applyCatalog({ disciplines: { penaltySolo: { name: 'Penalta sám' } } });
    expect(practiceDrills(1).find((d) => d.id === 'penaltySolo')?.name).toBe('Penalta sám');
  });
});

describe('série', () => {
  const t = practice('p', TODAY, ['A', 'B'], [
    ['A', 'warmupPasses@1', 14],
    ['B', 'warmupPasses@1', 11],
    ['A', 'penaltySolo@2', 7],
    ['A', 'penaltySolo@3', 6],
  ]);

  it('kritérium 22: série podle čísla, výsledky v pořadí hráčů', () => {
    const s = practiceSeries(t);
    expect(s.map((x) => x.key)).toEqual(['warmupPasses@1', 'penaltySolo@2', 'penaltySolo@3']);
    expect(s[0].results).toEqual([
      { playerId: 'A', value: 14, attempts: 20, max: 20 },
      { playerId: 'B', value: 11, attempts: 20, max: 20 },
    ]);
  });

  it('nedokončená série: odehrané pokusy', () => {
    const u = setAttempts(t, 'A', 'penaltySolo@3', 8);
    expect(practiceSeries(u)[2].results[0]).toEqual({ playerId: 'A', value: 6, attempts: 8, max: 20 });
  });

  it('disciplína série: fiveBarSolo → Udržení míče na pětce', () => {
    expect(seriesDrill('fiveBarSolo').id).toBe('fiveBarControl');
    expect(seriesDrill('penaltySolo').id).toBe('penaltySolo');
  });
});

describe('plán (PRD 5.11, 11. 11. 2026)', () => {
  const plan = newPractice('p', TODAY, '17:30', 'A', null, ['warmup', 'penaltySolo', 'streakShot3']);
  const T0 = Date.UTC(2026, 10, 11, 16, 30);
  const MIN = 60_000;

  it('kola v pořadí výběru, varianty po sobě, délky z katalogu; sám jen co se sám hraje', () => {
    expect(practiceRounds(plan).map((r) => [r.n, r.drill, r.metric, r.variant, r.min, r.item])).toEqual([
      [1, 'warmup', undefined, undefined, 9, 'round|1'],
      [2, 'penaltySolo', 'penaltySolo', 'varianta 1', 8, 'round|2'],
      [3, 'penaltySolo', 'penaltySolo', 'varianta 2', 8, 'round|3'],
      [4, 'streakShot3', 'streakShot3', undefined, 10, 'round|4'],
    ]);
    expect(plan.disciplineOrder).toEqual(['warmup', 'penaltySolo', 'streakShot3']);
    // Udržení míče na pětce sám nejde (jen klub a duo)
    expect(newPractice('x', TODAY, '17:30', 'A', null, ['fiveBarControl', 'passWallLane']).disciplineOrder).toEqual(['passWallLane']);
  });

  it('naplánovaný čas: kola + přechod 1 min mezi koly', () => {
    expect(practicePlanMinutes(['warmup', 'penaltySolo', 'streakShot3'])).toBe(9 + 8 + 8 + 10 + 3);
    expect(plan.durationMin).toBe(38);
    expect(practicePlanMinutes([])).toBe(0);
  });

  it('délky kol jsou v tréninku – změna katalogu je nehne', () => {
    applyCatalog({ disciplines: { penaltySolo: { min: 6 } } });
    expect(practiceRounds(plan)[1].min).toBe(8);
    expect(newPractice('q', TODAY, '17:30', 'A', null, ['penaltySolo']).durationMin).toBe(13);
  });

  it('aktuální kolo = první neukončené; dohraný plán null', () => {
    expect(currentRound(plan)?.n).toBe(1);
    const t = { ...plan, playTimes: { 'round|1': { startedAt: T0, endedAt: T0 + 9 * MIN }, 'round|2': { startedAt: T0 + 10 * MIN } } };
    expect(currentRound(t)?.n).toBe(2);
    const all = { ...plan, playTimes: Object.fromEntries([1, 2, 3, 4].map((n) => [`round|${n}`, { startedAt: T0, endedAt: T0 }])) };
    expect(currentRound(all)).toBeNull();
  });

  it('pevný plán: dál až po čase kola, nebo když jsou odehrané všechny pokusy', () => {
    const t = { ...plan, playTimes: { 'round|1': { startedAt: T0, endedAt: T0 + 9 * MIN }, 'round|2': { startedAt: T0 + 10 * MIN } } };
    const r2 = practiceRounds(t)[1];
    expect(roundRemainingSec(t, r2, T0 + 11 * MIN)).toBe(420);
    expect(canAdvance(t, r2, T0 + 11 * MIN)).toBe(false);
    expect(canAdvance(t, r2, T0 + 18 * MIN)).toBe(true);
    const done = setAttempts(setSolo(t, 'A', 'penaltySolo@2', 6), 'A', 'penaltySolo@2', 20);
    expect(canAdvance(done, r2, T0 + 11 * MIN)).toBe(true);
    // Rozcvička nic nezapisuje – jen po čase
    expect(canAdvance(plan, practiceRounds(plan)[0], T0)).toBe(false);
  });

  it('ve dvou: dál až po pokusech obou hráčů', () => {
    const pair = newPractice('p2', TODAY, '17:30', 'A', 'B', ['warmupPasses']);
    const t = { ...pair, playTimes: { 'round|1': { startedAt: T0 } } };
    const r = practiceRounds(t)[0];
    const a = setAttempts(setSolo(t, 'A', 'warmupPasses@1', 15), 'A', 'warmupPasses@1', 20);
    expect(canAdvance(a, r, T0 + MIN)).toBe(false);
    const ab = setAttempts(setSolo(a, 'B', 'warmupPasses@1', 12), 'B', 'warmupPasses@1', 20);
    expect(canAdvance(ab, r, T0 + MIN)).toBe(true);
  });

  it('hodiny kol: odehrané skutečně, hrané od zahájení, další navazují s přechodem', () => {
    const t = { ...plan, playTimes: { 'round|1': { startedAt: T0, endedAt: T0 + 9 * MIN }, 'round|2': { startedAt: T0 + 10 * MIN } } };
    const times = roundTimes(t, T0 + 11 * MIN).map((x) => [x.state, (x.start - T0) / MIN, (x.end - T0) / MIN]);
    expect(times).toEqual([
      ['done', 0, 9],
      ['playing', 10, 18],
      ['next', 19, 27],
      ['next', 28, 38],
    ]);
    // přetažené kolo posune další
    expect((roundTimes(t, T0 + 20 * MIN)[2].start - T0) / MIN).toBe(21);
  });
});

describe('zápasy ve dvou (12. 11. 2026)', () => {
  const T0 = Date.UTC(2026, 10, 12, 16, 0);
  const MIN = 60_000;
  it('zápas = kolo s BO; párový scénář 2 kola s prohozenými stranami; sám zápasy nejdou', () => {
    const p = newPractice('p', TODAY, '18:00', 'A', 'B', ['goalieWar', 'wall', 'penaltyKeeper'], { goalieWar: { bestOf: 3, legTo: 5 } });
    const rs = practiceRounds(p);
    expect(rs.map((r) => [r.drill, r.min, r.match?.sideA.join(), r.match?.bestOf ?? null])).toEqual([
      ['goalieWar', 24, 'A', 3],
      ['wall', 8, 'A', null],
      ['wall', 8, 'B', null],
      ['penaltyKeeper', 8, undefined, null],
      ['penaltyKeeper', 8, undefined, null],
    ]);
    expect(rs[0].match).toMatchObject({ id: 'practice|1|AvB', legTo: 5, kind: 'singles' });
    expect(rs[1].match?.wall).toBe('A');
    expect(p.durationMin).toBe(24 + 8 + 8 + 8 + 8 + 4);
    expect(p.matchFormats).toEqual({ goalieWar: { bestOf: 3, legTo: 5 } });
    expect(newPractice('q', TODAY, '18:00', 'A', null, ['goalieWar', 'penaltySolo']).disciplineOrder).toEqual(['penaltySolo']);
  });

  it('dál až po rozhodnutém zápase (nebo po čase)', () => {
    const p = newPractice('p', TODAY, '18:00', 'A', 'B', ['goalieWar'], { goalieWar: { bestOf: 3, legTo: 6 } });
    const t = { ...p, playTimes: { 'round|1': { startedAt: T0 } } };
    const r = practiceRounds(t)[0];
    const id = r.match!.id;
    expect(canAdvance({ ...t, scores: { [id]: { ga: 6, gb: 2 } } }, r, T0 + MIN)).toBe(false);
    expect(canAdvance({ ...t, scores: { [id]: { ga: 6, gb: 2 }, [`${id}#2`]: { ga: 6, gb: 4 } } }, r, T0 + MIN)).toBe(true);
    expect(canAdvance(t, r, T0 + 24 * MIN)).toBe(true);
  });
});

describe('běží / skončil', () => {
  const start = Date.UTC(2026, 10, 11, 16, 30);
  const started = { ...practice('p', TODAY, ['A']), playTimes: { training: { startedAt: start } } };

  it('zahájený a neukončený běží, ukončený ne', () => {
    expect(practiceRunning(started, start + HOUR)).toBe(true);
    expect(practiceEnded(started, start + HOUR)).toBe(false);
    const ended = { ...started, playTimes: { training: { startedAt: start, endedAt: start + HOUR } } };
    expect(practiceRunning(ended, start + 2 * HOUR)).toBe(false);
    expect(practiceEnded(ended, start + 2 * HOUR)).toBe(true);
  });

  it('neukončený po 12 h se bere jako skončený', () => {
    expect(practiceRunning(started, start + 13 * HOUR)).toBe(false);
    expect(practiceEnded(started, start + 13 * HOUR)).toBe(true);
  });
});

describe('oddělené od klubu', () => {
  const club = (id: string, date: string, vals: [string, string, number][]) =>
    vals.reduce((t, [p, k, v]) => setSolo(t, p, k, v), training(id, date, 'team', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], 4));

  it('docházka a „Jako minule“ vlastní tréninky nepočítají', () => {
    const ts = [training('c', '2026-11-01', 'team', ['A', 'B', 'C', 'D']), practice('p', '2026-11-05', ['A', 'Z'])];
    expect(attendance(ts, TODAY).get('A')).toEqual({ last: '2026-11-01', recent: 1, total: 1 });
    expect(attendance(ts, TODAY).get('Z')).toBeUndefined();
    expect(lastTraining(ts, TODAY)?.id).toBe('c');
  });

  it('kritérium 22: Vlastní – 3 tréninky seřazené, 2 pod čárou; klubový trénink se nepočítá', () => {
    const ts = [
      practice('p1', '2026-11-01', ['A'], [['A', 'penaltySolo@1', 7]]),
      practice('p2', '2026-11-03', ['A', 'B'], [['A', 'penaltySolo@1', 8], ['B', 'penaltySolo@1', 9], ['A', 'penaltySolo@2', 6]]),
      practice('p3', '2026-11-05', ['A', 'B'], [['A', 'penaltySolo@4', 9], ['B', 'penaltySolo@4', 9]]),
      club('c', '2026-11-06', [['B', 'penaltySolo@1', 10]]),
    ];
    const pen = computeSoloLadder(ts, { kind: 'all' }, 'avg', TODAY, 'practice').find((x) => x.metric === 'penaltySolo')!;
    expect(pen.ranked.map((r) => r.playerId)).toEqual(['A']);
    expect(pen.ranked[0]).toMatchObject({ trainings: 3, records: 4, sum: 30, sumMax: 80, avg: 7.5 });
    expect(pen.lowData.map((r) => r.playerId)).toEqual(['B']);
    expect(pen.lowData[0]).toMatchObject({ trainings: 2, sum: 18 });
  });

  it('Stanoviště vlastní tréninky nepočítají', () => {
    const ts = [practice('p1', '2026-11-01', ['A'], [['A', 'penaltySolo@1', 7]])];
    expect(computeSoloLadder(ts, { kind: 'all' }, 'avg', TODAY)).toEqual([]);
  });

  it('Vlastní: období podle data vlastního tréninku', () => {
    const ts = [practice('old', '2026-09-01', ['A'], [['A', 'penaltySolo@1', 7]]), practice('new', '2026-11-01', ['A'], [['A', 'penaltySolo@1', 3]])];
    const pen = computeSoloLadder(ts, { kind: 'form' }, 'total', TODAY, 'practice')[0];
    expect(pen.lowData[0]).toMatchObject({ trainings: 1, sum: 3, sumMax: 20 });
  });
});

describe('seznam vlastních tréninků', () => {
  const ts = [
    practice('a', '2026-11-01', ['A']),
    { ...practice('b', '2026-11-05', ['B', 'A']), startTime: '09:00' },
    { ...practice('c', '2026-11-05', ['A']), startTime: '18:00' },
    practice('d', '2026-11-06', ['B']),
    training('club', '2026-11-07', 'team', ['A', 'B', 'C', 'D']),
  ];

  it('hráč vidí své (i jako spoluhráč), nejnovější nahoře; klubové ne', () => {
    expect(practicesFor(ts, 'A').map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('admin vidí všechny', () => {
    expect(practicesFor(ts, 'X', true).map((t) => t.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('klubové tréninky bez vlastních', () => {
    expect(clubTrainings(ts).map((t) => t.id)).toEqual(['club']);
  });
});

describe('žebříček Vlastní – zápasy (12. 11. 2026)', () => {
  const game = (id: string, a: string, b: string, legs: [number, number][], date = '2026-11-10') => {
    const p = newPractice(id, date, '18:00', a, b, ['goalieWar'], { goalieWar: { bestOf: 3, legTo: 6 } });
    const m = practiceRounds(p)[0].match!;
    return { ...p, scores: Object.fromEntries(legs.map(([x, y], i) => [i ? `${m.id}#${i + 1}` : m.id, { ga: x, gb: y }])) };
  };

  it('podíl vyhraných zápasů, legy a skóre; málo dat pod 3 tréninky', () => {
    const ts = [game('g1', 'A', 'B', [[6, 2], [6, 4]]), game('g2', 'B', 'A', [[6, 5], [2, 6], [3, 6]]), game('g3', 'A', 'B', [[1, 6], [6, 3], [6, 0]]), game('g4', 'A', 'C', [[6, 1]])];
    const [gw] = computePracticeMatchLadder(ts, null, null, 3);
    expect(gw.discipline).toBe('goalieWar');
    expect(gw.ranked.map((r) => r.playerId)).toEqual(['A', 'B']);
    expect(gw.ranked[0]).toMatchObject({ trainings: 4, matches: 3, wins: 3, legs: 9, legWins: 7, gf: 48, gc: 27 });
    expect(gw.ranked[1]).toMatchObject({ trainings: 3, matches: 3, wins: 0, legs: 8 });
    // nedohraný zápas (g4, jen 1 leg) se počítá do legů, ne do zápasů
    expect(gw.lowData).toEqual([expect.objectContaining({ playerId: 'C', matches: 0, legs: 1, gf: 1, gc: 6 })]);
    expect(computePracticeMatchLadder(ts, '2026-11-11', null, 3)).toEqual([]);
  });
});

describe('statistiky napříč za stejných podmínek (12. 11. 2026)', () => {
  it('cvičení klub + duo: výsledky z vlastního tréninku duo jsou ve Stanovištích, ne ve Vlastní', () => {
    const duo = (id: string, date: string, v: number) => setSolo(newPractice(id, date, '18:00', 'A', 'B', ['penaltyKeeper']), 'A', 'penaltyKeeper@1', v);
    const ts = [duo('d1', '2026-11-01', 12), duo('d2', '2026-11-02', 14), practice('s1', '2026-11-03', ['A'], [['A', 'penaltySolo@1', 7]])];
    const club = computeSoloLadder(ts, { kind: 'all' }, 'avg', TODAY, 'club');
    expect(club.map((x) => x.metric)).toEqual(['penaltyKeeper']);
    expect(club[0].lowData[0]).toMatchObject({ playerId: 'A', trainings: 2, sum: 26 });
    const own = computeSoloLadder(ts, { kind: 'all' }, 'avg', TODAY, 'practice');
    expect(own.map((x) => x.metric)).toEqual(['penaltySolo']); // jen cvičení pouze pro vlastní trénink
  });

  it('zápasy 1 na 1: Vlastní počítá duo i singly z klubu; klubový Normální leg v singlu = Jedničky', () => {
    const clubT: Training = {
      id: 'c', date: '2026-11-05', startTime: '18:00', mode: 'team', tables: 2, attendees: ['A', 'B', 'C', 'D', 'E', 'F'], scores: {}, soloResults: {},
      simSplit: 'order', simTeams: null, format: 'custom', durationMin: 60, plan: { normal: 1 }, lockedRounds: [], breaks: [], disciplineMin: { normal: 8 },
    };
    const s = buildSchedule(clubT);
    const singles = s.matches.filter((m) => m.kind === 'singles');
    const doubles = s.matches.filter((m) => m.kind === 'doubles');
    expect(singles).toHaveLength(1);
    const scored = { ...clubT, scores: { [singles[0].id]: { ga: 6, gb: 3 }, ...(doubles[0] ? { [doubles[0].id]: { ga: 6, gb: 1 } } : {}) } };
    const duo = newPractice('p', '2026-11-06', '18:00', 'A', 'B', ['singles']);
    const m = practiceRounds(duo)[0].match!;
    const tables = computePracticeMatchLadder([scored, { ...duo, scores: { [m.id]: { ga: 6, gb: 4 } } }], null, null, 3);
    expect(tables.map((x) => x.discipline)).toEqual(['singles']);
    const rows = [...tables[0].ranked, ...tables[0].lowData];
    const winner = singles[0].sideA[0];
    expect(rows.find((r) => r.playerId === winner)).toMatchObject({ matches: winner === 'A' ? 2 : 1, wins: winner === 'A' ? 2 : 1 });
    // čtyřhra z klubu do Vlastní nepatří
    expect(rows.every((r) => [singles[0].sideA[0], singles[0].sideB[0], 'A', 'B'].includes(r.playerId))).toBe(true);
  });
});
