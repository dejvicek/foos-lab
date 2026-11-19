import { buildSchedule } from '../domain/schedule';
import type { Training } from '../domain/types';
import { flatRows, rowKey } from './now';
import { collapsedDone, keepLast, placeOf, roundNumbers, rowFormat, rowGoal, rowMinutes, rowName, rowSub } from './scheduleView';
import type { RoundStatus } from './roundState';

const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
const t: Training = {
  id: 't', date: '2026-11-18', startTime: '18:00', mode: 'team', tables: 4, attendees: ids, scores: {}, soloResults: {},
  simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan: { warmupPasses: 1, normal: 2, lossTax: 1 }, lockedRounds: [], breaks: [{ after: 2, min: 10 }],
};
const s = buildSchedule(t);
const refs = flatRows(s);
const row = (i: number) => s.sections[refs[i].section].rows[refs[i].row];
const st = (state: RoundStatus['state']): RoundStatus => ({ state, done: 0, total: 0, cells: [] });

describe('rozpis očima hráče (18. 11. 2026)', () => {
  it('čísla kol bez pauz, název disciplíny bez délky, délka z pravidla', () => {
    const nums = roundNumbers(s);
    const kinds = refs.map((r, i) => (row(i).kind === 'break' ? 'P' : String(nums.get(rowKey(r)))));
    expect(kinds).toEqual(['1', '2', 'P', '3', '4']);
    expect(rowName(row(0))).toBe('Přihrávky na pětce');
    expect(rowName(row(1))).toBe('Normální leg');
    const min = rowMinutes(s, t.durationMin);
    expect(min.get(rowKey(refs[1]))).toBeGreaterThan(0);
  });

  it('formát zápasu vedle délky kola, ne v názvu (19. 11. 2026)', () => {
    const bo = buildSchedule({ ...t, plan: { normal: 1, sim: 1 }, breaks: [], matchFormats: { normal: { bestOf: 3, legTo: 5 } } });
    const rows = bo.sections.flatMap((x) => x.rows);
    const normal = rows.find((r) => r.discipline === 'normal')!;
    expect(rowName(normal)).toBe('Normální leg');
    expect(rowFormat(normal)).toBe('BO3 do 5');
    expect(rowSub(24, normal)).toBe('24 min · BO3 do 5');
    expect(rowSub(24, normal, 'zapsáno 1 z 8')).toBe('24 min · BO3 do 5 · zapsáno 1 z 8');
    const sim = rows.find((r) => r.discipline === 'sim')!;
    expect(rowFormat(sim)).toMatch(/^BO\d/);
    expect(rowFormat(sim, true)).toMatch(/^BO\d+( do \d+)?$/); // krátce do hlavičky dlaždice
    expect(rowSub(20, sim, null, false)).toBe('20 min');
    expect(rowFormat(row(1))).toBeNull(); // výchozí formát se nepíše
    // do kolika se hraje – u všech kol (19. 11. 2026)
    expect(rowGoal(row(1))).toBe('do 6');
    expect(rowGoal(row(0))).toBe('20 pokusů');
    expect(rowGoal(normal)).toBe('BO3 do 5');
    expect(rowGoal(sim)).toMatch(/^BO\d do \d+ · poslední leg o 2, strop \d+$/);
    const s55 = buildSchedule({ ...t, plan: { start55: 1 }, breaks: [] }).sections.flatMap((x) => x.rows).find((r) => r.discipline === 'start55')!;
    expect(rowGoal(s55)).toBe('do 6 · o 2, strop 10');
  });

  it('krátké poslední slovo zůstane u předchozího (19. 11. 2026)', () => {
    expect(keepLast('Penalta z místa proti brankáři – varianta 1')).toBe('Penalta z místa proti brankáři – varianta\u00a01');
    expect(keepLast('Start 0:3')).toBe('Start\u00a00:3');
    expect(keepLast('Přihrávky na pětce')).toBe('Přihrávky na pětce');
  });

  it('kde jsem: hraju u stolu, mám volno, nebo nejsem v tréninku', () => {
    const r = row(1);
    const c = r.cells.find((x) => x?.type === 'match')!;
    const player = c.type === 'match' ? c.match.sideB[0] : '';
    expect(placeOf(r, player)).toEqual({ kind: 'play', table: r.cells.indexOf(c) + 1 });
    expect(placeOf(r, 'cizí')).toEqual({ kind: 'none' });
    expect(placeOf(r, null)).toEqual({ kind: 'none' });
  });

  it('běžící trénink sbalí odehraná kola i pauzu mezi nimi, pauza před dalším kolem zůstane; po konci nic', () => {
    const states = new Map(refs.map((r, i) => [rowKey(r), st(i < 2 ? 'done' : 'upcoming')]));
    // odehraná 1. a 2. kola; pauza za nimi (před 3. kolem) zůstane vidět
    expect([...collapsedDone(s, states, true)]).toEqual([rowKey(refs[0]), rowKey(refs[1])]);
    const later = new Map(refs.map((r, i) => [rowKey(r), st(i < 4 ? 'done' : 'playing')]));
    later.set(rowKey(refs[2]), st('upcoming')); // nezahájená pauza mezi odehranými koly se sbalí s nimi
    expect([...collapsedDone(s, later, true)]).toEqual(refs.slice(0, 4).map(rowKey));
    expect(collapsedDone(s, later, false).size).toBe(0);
    expect(collapsedDone(s, null, true).size).toBe(0);
  });
});
