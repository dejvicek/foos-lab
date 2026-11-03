import { eventFromRow, eventToRow, isEmptyScore, playerFromRow, playerToRow, playTimeFromRow, playTimeToRow, scoreToRow, soloRow, soloToRows, trainingFromRow, trainingToRow } from './mapping';
import type { Player, Training } from '../domain/types';

const player: Player = { id: 'p1', name: 'Honza', archived: false, order: 3 };
const training: Training = {
  id: 't1',
  date: '2026-10-31', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'classic', durationMin: 180, plan: {}, lockedRounds: [],
  mode: 'team',
  tables: 4,
  attendees: ['p1', 'p2', 'p3', 'p4'],
  scores: { 'league|1|1|p1+p2vp3+p4': { ga: 6, gb: 2, la: 1, lb: 0 } },
  notes: 'pozn',
};

describe('mapping', () => {
  it('hráč tam a zpět', () => {
    expect(playerToRow(player)).toEqual({ id: 'p1', name: 'Honza', archived: false, sort_order: 3 });
    expect(playerFromRow(playerToRow(player))).toEqual(player);
  });

  it('trénink tam a zpět včetně skóre jen svého tréninku', () => {
    const rows = [
      scoreToRow('t1', 'league|1|1|p1+p2vp3+p4', { ga: 6, gb: 2, la: 1, lb: 0 }),
      scoreToRow('jiny', 'x', { ga: 1, gb: 1 }),
    ];
    expect(trainingFromRow(trainingToRow(training), rows, [])).toEqual(training);
  });

  it('trénink bez poznámky nemá klíč notes', () => {
    const { notes: _n, ...noNotes } = training;
    const back = trainingFromRow(trainingToRow({ ...noNotes, scores: {} }), [], []);
    expect(back).toEqual({ ...noNotes, scores: {} });
  });

  it('čas začátku a výsledky sólové části tam a zpět', () => {
    const t: Training = { ...training, startTime: '17:30', soloResults: { p1: { fiveBarControl: 2, setShooting: 0 }, p2: { warmupPasses: 18 } } };
    const solo = [...soloToRows(t), { training_id: 'jiny', player_id: 'p1', metric: 'chain' as const, round: 0, value: 3 }];
    expect(trainingToRow(t).start_time).toBe('17:30');
    expect(trainingFromRow(trainingToRow(t), [], solo)).toEqual({ ...t, scores: {} });
  });

  it('starý řádek bez start_time dostane 18:00, bez sim_split rozdělení podle výkonu', () => {
    const row = { ...trainingToRow(training), start_time: null, sim_split: null, sim_teams: null };
    expect(trainingFromRow(row, [], [])).toMatchObject({ startTime: '18:00', simSplit: 'performance', simTeams: null });
  });

  it('konfigurovatelný trénink tam a zpět (formát, délka, plán, zamčená kola, výsledky po kolech)', () => {
    const row = { time: 0, label: '1. kolo', kind: 'groups' as const, cells: [null], waiting: [] };
    const t: Training = {
      ...training,
      scores: {},
      format: 'custom',
      durationMin: 150,
      plan: { setShooting: 2, normal: 3 },
      lockedRounds: [{ discipline: 'setShooting', rows: [row] }],
      soloResults: { p1: { 'setShooting@1': 12, 'setShooting@2': 9 } },
    };
    const back = trainingFromRow(trainingToRow(t), [], soloToRows(t));
    expect(back).toEqual(t);
    expect(soloToRows(t).map((r) => [r.metric, r.round])).toEqual([['setShooting', 1], ['setShooting', 2]]);
  });

  it('starý řádek bez nových sloupců je klasický trénink', () => {
    const row = { ...trainingToRow(training), format: null, duration_min: null, plan: null, locked_rounds: null };
    expect(trainingFromRow(row, [], [])).toMatchObject({ format: 'classic', durationMin: 180, plan: {}, lockedRounds: [] });
  });

  it('zamčené týmy tam a zpět', () => {
    const t: Training = { ...training, scores: {}, simSplit: 'performance', simTeams: { A: ['p1', 'p3'], B: ['p2', 'p4'] } };
    expect(trainingFromRow(trainingToRow(t), [], [])).toEqual(t);
  });

  it('isEmptyScore: nula je platné skóre', () => {
    expect(isEmptyScore({ ga: null, gb: undefined })).toBe(true);
    expect(isEmptyScore({ ga: 0 })).toBe(false);
  });
});

describe('časy utkání (Zdržovači)', () => {
  it('řádek ↔ PlayTime: ISO čas v databázi, ms v doméně; trénink je dostane podle ID', () => {
    const row = playTimeToRow('t1', 'league|1|1|a+bvc+d', { startedAt: Date.parse('2026-11-02T18:01:30Z') });
    expect(row).toEqual({ training_id: 't1', item_id: 'league|1|1|a+bvc+d', started_at: '2026-11-02T18:01:30.000Z', ended_at: null });
    expect(playTimeFromRow(row)).toEqual({ startedAt: Date.parse('2026-11-02T18:01:30Z') });
    const t = trainingFromRow(trainingToRow({ ...training, scores: {} }), [], [], [row, { ...row, training_id: 'jiny' }]);
    expect(t.playTimes).toEqual({ 'league|1|1|a+bvc+d': { startedAt: Date.parse('2026-11-02T18:01:30Z') } });
  });
});

describe('pokusy cvičení', () => {
  it('řádek s pokusy → soloAttempts; zapsáno číslem (attempts null) pokusy nemá', () => {
    const t = trainingFromRow(trainingToRow({ ...training, scores: {} }), [], [
      { training_id: training.id, player_id: 'p1', metric: 'warmupPasses', round: 0, value: 9, attempts: 14 },
      { training_id: training.id, player_id: 'p2', metric: 'warmupPasses', round: 0, value: 12, attempts: null },
    ]);
    expect(t.soloResults).toEqual({ p1: { warmupPasses: 9 }, p2: { warmupPasses: 12 } });
    expect(t.soloAttempts).toEqual({ p1: { warmupPasses: 14 } });
    expect(soloRow('t', 'p2', 'warmupPasses', 12)).toMatchObject({ value: 12, attempts: null });
  });
});

describe('události her', () => {
  it('řádek ↔ GameEvent; trénink dostane své události', () => {
    const e = { id: 'e1', itemId: 'league|1|1|a+bvc+d', at: Date.parse('2026-11-02T18:01:00Z'), kind: 'goal' as const, side: 'A' as const, delta: 1 as const };
    const row = eventToRow('t1', e);
    expect(row).toEqual({ id: 'e1', training_id: 't1', item_id: e.itemId, at: '2026-11-02T18:01:00.000Z', kind: 'goal', side: 'A', player_id: null, delta: 1 });
    expect(eventFromRow(row)).toEqual(e);
    const t = trainingFromRow(trainingToRow({ ...training, scores: {} }), [], [], [], [row, { ...row, id: 'e2', training_id: 'jiny' }]);
    expect(t.events).toEqual([e]);
  });

  it('neznámá (odstraněná) disciplína v uloženém plánu se při načtení vynechá', () => {
    const row = { ...trainingToRow({ ...training, format: 'custom', plan: { normal: 2 } }), plan: { normal: 2, blockToControl: 1 } as Training['plan'] };
    expect(trainingFromRow(row, [], []).plan).toEqual({ normal: 2 });
  });
});

