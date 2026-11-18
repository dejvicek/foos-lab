import { buildSchedule } from '../domain/schedule';
import type { Training } from '../domain/types';
import { flatRows, rowKey } from './now';
import { collapsedDone, placeOf, roundNumbers, rowMinutes, rowName } from './scheduleView';
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
