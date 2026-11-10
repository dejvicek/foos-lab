import { AUTO_END_MS, autoEndIn, dueAutoEnds, finishedAt } from './autoEnd';
import { drillItemId } from './queue';
import { buildSchedule } from './schedule';
import { soloMetric } from './solo';
import type { GameEvent, Training } from './types';
import { H, training } from '../test/fixtures';

const base: Training = { ...training('a', '2026-11-10', 'team', H(4), 2), format: 'custom', durationMin: 60, plan: { warmup: 1, warmupPasses: 1, normal: 1 }, disciplineOrder: ['warmup', 'warmupPasses', 'normal'] };
const s = buildSchedule(base);
const rows = s.sections.flatMap((x) => x.rows);
const m = s.matches.find((x) => x.discipline === 'normal')!;
const drillRow = rows.find((r) => r.discipline === 'warmupPasses')!;
const drill = drillRow.cells.find((c) => c?.type === 'group')!;
const drillPlayers = drill.type === 'group' ? drill.players : [];
const drillId = drillItemId(drillRow, drillRow.cells.indexOf(drill) + 1, drillPlayers);
const warmRow = rows.find((r) => r.discipline === 'warmup')!;
const warm = warmRow.cells.find((c) => c?.type === 'group')!;
const warmId = drillItemId(warmRow, warmRow.cells.indexOf(warm) + 1, warm.type === 'group' ? warm.players : []);
const ev = (itemId: string, at: number): GameEvent => ({ id: `${itemId}-${at}`, itemId, at, kind: 'goal', side: 'A', delta: 1 });

describe('konec utkání po dohraném výsledku (10. 11. 2026)', () => {
  it('zápas: dohraný leg → čas posledního ťuknutí; nedohraný, bez ťukání nebo Rozcvička → null', () => {
    const done = { ...base, scores: { [m.id]: { ga: 6, gb: 4 } }, events: [ev(m.id, 1000), ev(m.id, 5000)] };
    expect(finishedAt(done, s, m.id)).toBe(5000);
    expect(finishedAt({ ...done, scores: { [m.id]: { ga: 5, gb: 4 } } }, s, m.id)).toBeNull();
    expect(finishedAt({ ...done, events: [] }, s, m.id)).toBeNull(); // zapsané číslem (notebook) potvrzuje člověk
    expect(finishedAt({ ...done, events: [ev(warmId, 1000)] }, s, warmId)).toBeNull();
  });

  it('cvičení: hotové až po všech pokusech všech hráčů skupiny', () => {
    const max = soloMetric('warmupPasses').max;
    const key = 'warmupPasses@' + drillRow.roundNo;
    const res = (n: number) => Object.fromEntries(drillPlayers.map((p) => [p, { [key]: n }]));
    const t = { ...base, soloResults: res(max - 2), soloAttempts: res(max), events: [ev(drillId, 7000)] };
    expect(finishedAt(t, s, drillId)).toBe(7000);
    expect(finishedAt({ ...t, soloAttempts: { ...res(max), [drillPlayers[0]]: { [key]: max - 1 } } }, s, drillId)).toBeNull();
  });

  it('odpočet a konec: jen zahájené a neukončené; konec = poslední ťuknutí + 15 s', () => {
    const t = { ...base, scores: { [m.id]: { ga: 6, gb: 4 } }, events: [ev(m.id, 10_000)], playTimes: { [m.id]: { startedAt: 2_000 } } };
    expect(autoEndIn(t, s, m.id, 12_000)).toBe(AUTO_END_MS - 2_000);
    expect(dueAutoEnds(t, s, 24_999)).toEqual([]);
    expect(dueAutoEnds(t, s, 60_000)).toEqual([{ id: m.id, startedAt: 2_000, endedAt: 10_000 + AUTO_END_MS }]);
    // už ukončené nebo nezahájené (organizátor potvrzuje sám)
    expect(dueAutoEnds({ ...t, playTimes: { [m.id]: { startedAt: 2_000, endedAt: 11_000 } } }, s, 60_000)).toEqual([]);
    expect(autoEndIn({ ...t, playTimes: {} }, s, m.id, 60_000)).toBeNull();
    // oprava výsledku (leg už není dohraný) odpočet zruší
    expect(autoEndIn({ ...t, scores: { [m.id]: { ga: 5, gb: 4 } } }, s, m.id, 60_000)).toBeNull();
  });
});
