import { buildSchedule } from '../domain/schedule';
import { drillItemId, pauseId, pauseStates, queueOf, runQueue, TRAINING_ITEM } from '../domain/queue';
import type { PlayTimes, Training } from '../domain/types';
import { H } from '../test/fixtures';
import { flatRows, rowKey } from './now';
import { liveText, playingRow, roundStates } from './roundState';
import { usedTables } from './components/TrainingTable';

const M = 60_000;
const T0 = 1_000_000 * M;
const at = (min: number) => T0 + min * M;

const training = (): Training => ({
  id: 'r',
  date: '2026-11-02',
  startTime: '18:00',
  mode: 'team',
  tables: 2,
  attendees: H(8),
  scores: {},
  soloResults: {},
  simSplit: 'order',
  simTeams: null,
  format: 'custom',
  durationMin: 60,
  plan: { warmupPasses: 1, normal: 2 },
  lockedRounds: [],
});

const t = training();
const s = buildSchedule(t);
const rows = flatRows(s).map((ref) => ({ ref, row: s.sections[ref.section].rows[ref.row] }));
const play = rows.filter((r) => r.row.kind !== 'break');
/** ID utkání kola (stejně jako fronta). */
const ids = (i: number) =>
  play[i].row.cells.flatMap((c, j) => (!c ? [] : c.type === 'match' ? [c.match.id] : c.players.length ? [drillItemId(play[i].row, j + 1, c.players)] : []));
const run = (times: PlayTimes, now: number) => {
  const q = queueOf(s);
  return roundStates(s, runQueue(q, times, usedTables(s).map((j) => j + 1), now), pauseStates(q, times, now));
};
const done = (i: number, from: number, to: number): PlayTimes => Object.fromEntries(ids(i).map((id) => [id, { startedAt: at(from), endedAt: at(to) }]));

describe('stav kol v rozpisu (odehrané / hraje se / bude se hrát)', () => {
  it('před zahájením tréninku žádný stav', () => {
    expect(run({}, at(5))).toBeNull();
  });

  it('po zahájení: první kolo se hraje (je na řadě), ostatní přijdou', () => {
    const r = run({ [TRAINING_ITEM]: { startedAt: at(0) } }, at(1))!;
    expect(r.get(rowKey(play[0].ref))).toMatchObject({ state: 'playing', done: 0, total: ids(0).length });
    expect(r.get(rowKey(play[1].ref))!.state).toBe('upcoming');
  });

  it('kolo je odehrané, až když jsou potvrzená všechna jeho utkání; stav má i každý stůl', () => {
    const [a, b] = ids(1);
    const times: PlayTimes = {
      [TRAINING_ITEM]: { startedAt: at(0) },
      ...done(0, 0, 8),
      [pauseId(0)]: { startedAt: at(8), endedAt: at(9) },
      [a]: { startedAt: at(10), endedAt: at(16) },
      [b]: { startedAt: at(11) },
    };
    const r = run(times, at(18))!;
    expect(r.get(rowKey(play[0].ref))!.state).toBe('done');
    const second = r.get(rowKey(play[1].ref))!;
    expect(second).toMatchObject({ state: 'playing', done: 1, total: 2, since: at(10) });
    expect(second.cells.filter(Boolean)).toEqual(['done', 'playing']);
    expect(r.get(rowKey(play[2].ref))!.state).toBe('upcoming');
  });

  it('kolo, kde je utkání jen na řadě (nikdo nezačal), se ukazuje jako „na řadě“, ne „hraje se“', () => {
    const r = run({ [TRAINING_ITEM]: { startedAt: at(0) } }, at(20))!;
    const st = r.get(rowKey(play[0].ref))!;
    expect(st.state).toBe('playing');
    expect(liveText(st, at(20), false)).toBe('na řadě');
  });

  it('pauza: běží → hraje se, skončila → odehraná, čeká na organizátora → přijde', () => {
    const pauseRow = rows.find((x) => x.row.label === 'Pauza')!;
    const base = { [TRAINING_ITEM]: { startedAt: at(0) }, ...done(0, 0, 8) };
    expect(run(base, at(9))!.get(rowKey(pauseRow.ref))!.state).toBe('upcoming');
    expect(run({ ...base, [pauseId(0)]: { startedAt: at(8) } }, at(9))!.get(rowKey(pauseRow.ref))).toMatchObject({ state: 'playing', since: at(8) });
    expect(run({ ...base, [pauseId(0)]: { startedAt: at(8), endedAt: at(9) } }, at(10))!.get(rowKey(pauseRow.ref))!.state).toBe('done');
  });

  it('závěrečný zápis je odehraný, až když je odehrané vše', () => {
    const last = rows.at(-1)!;
    const all: PlayTimes = { [TRAINING_ITEM]: { startedAt: at(0) }, ...done(0, 0, 8), [pauseId(0)]: { startedAt: at(8), endedAt: at(9) }, ...done(1, 10, 16), ...done(2, 17, 24) };
    const pauses = rows.filter((x) => x.row.label === 'Pauza').length;
    for (let k = 1; k < pauses; k++) all[pauseId(k)] = { startedAt: at(16), endedAt: at(17) };
    expect(run(all, at(30))!.get(rowKey(last.ref))!.state).toBe('done');
    const { [ids(2)[0]]: _, ...notAll } = all;
    expect(run(notAll, at(30))!.get(rowKey(last.ref))!.state).toBe('upcoming');
  });

  it('výchozí rozbalené kolo je první hrané', () => {
    const r = run({ [TRAINING_ITEM]: { startedAt: at(0) }, ...done(0, 0, 8), [pauseId(0)]: { startedAt: at(8), endedAt: at(9) } }, at(10))!;
    expect(playingRow(s, r)).toEqual(play[1].ref);
    expect(playingRow(s, null)).toBeNull();
  });
});
