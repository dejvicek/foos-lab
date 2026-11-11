import { applyCatalog } from './catalog';
import { attendance, lastTraining } from './attendance';
import { computeSoloLadder } from './soloLadder';
import {
  clubTrainings,
  isClub,
  isPractice,
  newPractice,
  nextSeriesNo,
  practiceDrills,
  practiceEnded,
  practiceMetric,
  practiceRunning,
  practiceSeries,
  practicesFor,
  seriesDrill,
  seriesVariant,
} from './practice';
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
    expect(ids).toEqual(['warmup', 'passWallLane', 'fiveBarControl', 'penaltySolo', 'backShotSolo']);
  });

  it('ve dvou: i cvičení s bránícím soupeřem; vyřazená ne', () => {
    const ids = practiceDrills(2).map((d) => d.id);
    expect(ids).toContain('warmupPasses');
    expect(ids).toContain('penaltyKeeper');
    expect(ids).toContain('chain');
    expect(ids).not.toContain('setShooting');
    expect(ids).not.toContain('backRodsBuildUp');
    expect(ids.every((id) => discipline(id).kind === 'drill')).toBe(true);
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
    expect(practiceSeries(u)[2].results[0]).toEqual({ playerId: 'A', value: 6, attempts: 8, max: 10 });
  });

  it('další série = nejvyšší + 1; prázdný trénink začíná 1', () => {
    expect(nextSeriesNo(t)).toBe(4);
    expect(nextSeriesNo(practice('q', TODAY, ['A']))).toBe(1);
  });

  it('varianta: první série metriky varianta 0, druhá 1, třetí zase 0', () => {
    expect(seriesVariant(t, 'penaltySolo', 2)).toBe(0);
    expect(seriesVariant(t, 'penaltySolo', 3)).toBe(1);
    expect(seriesVariant(t, 'penaltySolo', 4)).toBe(0);
    expect(seriesVariant(t, 'warmupPasses', 4)).toBe(1);
  });

  it('disciplína série: fiveBarSolo → Udržení míče na pětce', () => {
    expect(seriesDrill('fiveBarSolo').id).toBe('fiveBarControl');
    expect(seriesDrill('penaltySolo').id).toBe('penaltySolo');
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
    expect(pen.ranked[0]).toMatchObject({ trainings: 3, records: 4, sum: 30, sumMax: 40, avg: 7.5 });
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
    expect(pen.lowData[0]).toMatchObject({ trainings: 1, sum: 3, sumMax: 10 });
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
