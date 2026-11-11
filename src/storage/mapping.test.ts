import { drillTapToJson, eventFromRow, loadedFromJson, scoreTapToJson, type ChangesJson, isEmptyScore, playerFromRow, playerToRow, playTimeFromRow, playTimeToRow, scoreToRow, soloRow, soloToRows, trainingFromRow, trainingToRow } from './mapping';
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
    expect(playerToRow(player)).toEqual({ id: 'p1', name: 'Honza', archived: false, sort_order: 3, is_organizer: false });
    // organizátor (migrace 20)
    expect(playerFromRow(playerToRow({ ...player, organizer: true }))).toEqual({ ...player, organizer: true });
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

  it('vlastní trénink (5.11) tam a zpět: formát, 1–2 hráči, série metrika@n', () => {
    const t: Training = { ...training, scores: {}, format: 'practice', mode: 'single', tables: 1, attendees: ['A', 'B'], durationMin: 0, createdBy: 'A', soloResults: { A: { 'penaltySolo@1': 7, 'penaltySolo@2': 5 } } };
    const back = trainingFromRow(trainingToRow(t), [], soloToRows(t));
    expect(back).toEqual(t);
    expect(soloToRows(t).map((r) => [r.metric, r.round])).toEqual([['penaltySolo', 1], ['penaltySolo', 2]]);
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
    const row = { id: 'e1', training_id: 't1', item_id: e.itemId, at: '2026-11-02T18:01:00.000Z', kind: 'goal' as const, side: 'A' as const, player_id: null, delta: 1 };
    expect(eventFromRow(row)).toEqual(e);
    const t = trainingFromRow(trainingToRow({ ...training, scores: {} }), [], [], [], [row, { ...row, id: 'e2', training_id: 'jiny' }]);
    expect(t.events).toEqual([e]);
  });

  it('ťuknutí pro databázi: čas jako ISO, pokus s druhem a utkáním', () => {
    const at = Date.parse('2026-11-02T18:01:00Z');
    expect(scoreTapToJson({ id: 'e1', at, field: 'lb', delta: 1, max: 30 })).toEqual({ id: 'e1', at: '2026-11-02T18:01:00.000Z', field: 'lb', delta: 1, max: 30 });
    expect(drillTapToJson({ id: 'd1', at, itemId: 'drill|x', ok: false, delta: -1, dValue: 0, dAttempts: -1 })).toEqual({
      id: 'd1', at: '2026-11-02T18:01:00.000Z', item: 'drill|x', kind: 'miss', delta: -1, dvalue: 0, dattempts: -1,
    });
  });

  it('neznámá (odstraněná) disciplína v uloženém plánu se při načtení vynechá', () => {
    const row = { ...trainingToRow({ ...training, format: 'custom', plan: { normal: 2 } }), plan: { normal: 2, blockToControl: 1 } as Training['plan'] };
    expect(trainingFromRow(row, [], []).plan).toEqual({ normal: 2 });
  });
});


describe('odpověď changes_since', () => {
  const trainingRow = { id: 't1', date: '2026-11-10', start_time: '18:00', sim_split: 'order', sim_teams: null, format: 'custom', duration_min: 120, plan: {}, locked_rounds: [], breaks: null, created_by: null, mode: 'team', tables: 2, attendees: ['a'], notes: null, updated_at: 'x' };
  const base = { cursor: '2026-11-10T10:00:00+00:00', players: [], trainings: [], scores: [], solo_results: [], play_times: [], catalog: null, deleted: [] };
  /** Odpověď serveru tak, jak přijde (řádky mají i sloupce, které appka nezná). */
  const json = (x: object) => x as unknown as ChangesJson;

  it('kompletní data: tréninky se skóre, výsledky a časy; kurzor pro příště', () => {
    const out = loadedFromJson(json({
      ...base,
      full: true,
      players: [{ id: 'a', name: 'A', archived: false, sort_order: 1, is_admin: true, is_organizer: true }],
      trainings: [trainingRow],
      scores: [{ training_id: 't1', match_id: 'm1', ga: 1, gb: 0, la: null, lb: null }],
      solo_results: [{ training_id: 't1', player_id: 'a', metric: 'chain', round: 0, value: 3, attempts: 5 }],
      play_times: [{ training_id: 't1', item_id: 'm1', started_at: '2026-11-10T10:00:00Z', ended_at: null }],
      catalog: { skills: [] },
    }));
    if (!('full' in out)) throw new Error('má být kompletní');
    expect(out.full.cursor).toBe('2026-11-10T10:00:00+00:00');
    expect(out.full.players).toEqual([{ id: 'a', name: 'A', archived: false, order: 1, organizer: true }]);
    expect(out.full.trainings[0]).toMatchObject({ id: 't1', scores: { m1: { ga: 1, gb: 0 } }, soloResults: { a: { chain: 3 } }, soloAttempts: { a: { chain: 5 } }, playTimes: { m1: { startedAt: Date.parse('2026-11-10T10:00:00Z') } } });
    expect(out.full.catalog).toEqual({ skills: [] });
  });

  it('změny: řádky podle tabulek a smazané klíče; katalog jen když se změnil', () => {
    const out = loadedFromJson(json({
      ...base,
      full: false,
      trainings: [trainingRow],
      scores: [{ training_id: 't1', match_id: 'm1', ga: 2, gb: 0, la: null, lb: null }],
      solo_results: [{ training_id: 't1', player_id: 'a', metric: 'chain', round: 2, value: 3, attempts: null }],
      play_times: [{ training_id: 't1', item_id: 'm1', started_at: null, ended_at: '2026-11-10T10:05:00Z' }],
      deleted: [
        { tbl: 'players', key: { id: 'p9' } },
        { tbl: 'trainings', key: { id: 't9' } },
        { tbl: 'scores', key: { training_id: 't1', match_id: 'm2' } },
        { tbl: 'solo_results', key: { training_id: 't1', player_id: 'a', metric: 'chain', round: 0 } },
        { tbl: 'play_times', key: { training_id: 't1', item_id: 'm2' } },
        { tbl: 'neznama', key: {} },
      ],
    }));
    if (!('changes' in out)) throw new Error('mají být změny');
    const c = out.changes;
    expect(c.cursor).toBe('2026-11-10T10:00:00+00:00');
    expect(c.trainings[0]).toMatchObject({ id: 't1', tables: 2, scores: {} });
    expect(c.scores).toEqual([{ trainingId: 't1', matchId: 'm1', score: { ga: 2, gb: 0 } }]);
    expect(c.solo).toEqual([{ trainingId: 't1', playerId: 'a', key: 'chain@2', value: 3, attempts: null }]);
    expect(c.playTimes).toEqual([{ trainingId: 't1', itemId: 'm1', time: { endedAt: Date.parse('2026-11-10T10:05:00Z') } }]);
    expect(c.catalog).toBeUndefined();
    expect(c.deleted).toEqual({
      players: ['p9'],
      trainings: ['t9'],
      scores: [{ trainingId: 't1', matchId: 'm2' }],
      solo: [{ trainingId: 't1', playerId: 'a', key: 'chain' }],
      playTimes: [{ trainingId: 't1', itemId: 'm2' }],
    });
  });
});

describe('verze nastavení tréninku', () => {
  it('řádek → trénink nese verzi; do řádku k uložení se neposílá (očekávaná verze jde zvlášť)', () => {
    const row = { ...trainingToRow({ ...training, scores: {} }), version: 7 };
    expect(trainingFromRow(row, [], []).version).toBe(7);
    expect('version' in trainingToRow({ ...training, version: 7 })).toBe(false);
    expect(trainingFromRow(trainingToRow(training), [], []).version).toBeUndefined();
  });
});
