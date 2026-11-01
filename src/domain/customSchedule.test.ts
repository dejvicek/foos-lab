import { buildSchedule } from './schedule';
import { autoPlan, DEFAULT_SELECTION } from './plan';
import type { ScheduleRow, Training } from './types';
import { H } from '../test/fixtures';

const custom = (n: number, tables: 2 | 3 | 4, over: Partial<Training> = {}): Training => ({
  id: 'c',
  date: '2026-11-01',
  startTime: '18:00',
  mode: 'team',
  tables,
  attendees: H(n),
  scores: {},
  soloResults: {},
  simSplit: 'order',
  simTeams: null,
  format: 'custom',
  durationMin: 180,
  plan: autoPlan(DEFAULT_SELECTION, 180, n, tables),
  lockedRounds: [],
  ...over,
});
const rows = (t: Training) => buildSchedule(t).sections.flatMap((s) => s.rows);
const playRows = (t: Training) => rows(t).filter((r) => r.kind !== 'break');

describe('rozpis konfigurovatelného tréninku', () => {
  it('kolo = jedna disciplína pro všechny stoly; cvičení, zápasy, simulace, zápis', () => {
    const s = buildSchedule(custom(8, 4));
    expect(s.sections.map((x) => x.id)).toEqual(['drills', 'matches', 'sim']);
    for (const r of playRows(custom(8, 4))) {
      const ds = new Set(r.cells.filter(Boolean).map((c) => (c!.type === 'match' ? c!.match.discipline : c!.discipline)));
      expect(ds.size).toBe(1);
    }
    const all = rows(custom(8, 4));
    expect(all.at(-1)).toMatchObject({ label: 'Zápis a vyhodnocení', kind: 'break' });
    expect(all.at(-1)!.time + 10).toBeLessThanOrEqual(180);
  });

  it('cvičení: dvojice, klíč výsledku s číslem kola, ID zápasů s číslem kola', () => {
    const r = playRows(custom(8, 4));
    expect(r[0].label).toBe('Kolo 1');
    expect(r[0].cells[0]).toMatchObject({ type: 'group', metric: 'warmupPasses', soloRound: 1, discipline: 'warmupPasses' });
    const firstMatch = r.find((x) => x.cells.some((c) => c?.type === 'match'))!;
    const m = firstMatch.cells.find((c) => c?.type === 'match');
    expect(m?.type === 'match' && m.match.id.startsWith(`league|${firstMatch.label.split(' ')[1]}|1|`)).toBe(true);
  });

  it('zamčená kola se nemění, když přibude hráč', () => {
    const t = custom(8, 4);
    const before = playRows(t);
    const lockedRounds = before.slice(0, 7).map((row: ScheduleRow) => ({ discipline: discipline(row), rows: [row] }));
    const after = playRows({ ...t, attendees: H(9), lockedRounds });
    expect(after.slice(0, 7).map((r) => r.cells)).toEqual(before.slice(0, 7).map((r) => r.cells));
    expect(after.slice(7).some((r) => JSON.stringify(r).includes('"H9"'))).toBe(true);
  });

  it('+1 kolo s odehranými koly jde za zamčená kola', () => {
    const t = custom(8, 4);
    const before = playRows(t);
    const lockedRounds = before.slice(0, 7).map((row) => ({ discipline: discipline(row), rows: [row] }));
    const plan = { ...t.plan, warmupPasses: (t.plan.warmupPasses ?? 0) + 1 };
    const after = playRows({ ...t, plan, lockedRounds });
    expect(after.slice(0, 7).map((r) => r.cells)).toEqual(before.slice(0, 7).map((r) => r.cells));
    expect(after.slice(7).some((r) => discipline(r) === 'warmupPasses')).toBe(true);
  });

  it('deterministické', () => {
    expect(buildSchedule(custom(11, 3))).toEqual(buildSchedule(custom(11, 3)));
  });

  it('klasický trénink beze změny', () => {
    const classic = { ...custom(8, 4), format: 'classic' as const };
    expect(buildSchedule(classic).sections.map((s) => s.id)).toEqual(['solo', 'league', 'sim']);
  });
});

function discipline(row: ScheduleRow) {
  const c = row.cells.find(Boolean)!;
  return (c.type === 'match' ? c.match.discipline : c.discipline)!;
}
