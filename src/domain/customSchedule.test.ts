import { buildSchedule } from './schedule';
import { autoPlan, DEFAULT_SELECTION } from './plan';
import type { ScheduleRow, TableCount, Training } from './types';
import { newTraining } from './training';
import { discipline as disc } from './disciplines';
import { H } from '../test/fixtures';

const custom = (n: number, tables: TableCount, over: Partial<Training> = {}): Training => ({
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
    expect(r[0].label).toBe('1. kolo');
    expect(r[0].cells[0]).toMatchObject({ type: 'group', metric: 'warmupPasses', soloRound: 1, discipline: 'warmupPasses' });
    const firstMatch = r.find((x) => x.cells.some((c) => c?.type === 'match'))!;
    const m = firstMatch.cells.find((c) => c?.type === 'match');
    expect(m?.type === 'match' && m.match.id.startsWith(`league|${firstMatch.roundNo}|1|`)).toBe(true);
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

describe('ztráty v konfigurovatelném tréninku', () => {
  it('zapisují se u každého zápasu ligových disciplín (i Start 0:3 + daň), ne v simulaci', () => {
    const s = buildSchedule(custom(8, 4, { plan: { start03: 1, lossTax: 1, normal: 1, singles: 1, sim: 1 } }));
    const league = s.matches.filter((m) => m.block === 'league');
    expect(league.length).toBeGreaterThan(0);
    expect(league.every((m) => m.trackLosses)).toBe(true);
    expect(league.some((m) => m.discipline === 'start03')).toBe(true);
    expect(s.matches.filter((m) => m.block === 'sim').every((m) => !m.trackLosses)).toBe(true);
  });
});

it('nový trénink má dnešní datum', () => {
  expect(newTraining('x', '2026-11-03', custom(8, 4, { date: '2026-10-01' }), null).date).toBe('2026-11-03');
});

describe('úpravy plánu 2. 11. 2026', () => {
  it('výchozí pauzy po sekcích: po cvičeních a po zápasech (před simulací)', () => {
    const r = rows(custom(8, 4, { plan: { warmupPasses: 1, normal: 2, sim: 1 } }));
    const kinds = r.map((x) => (x.label === 'Pauza' ? 'P' : x.kind === 'groups' ? 'D' : x.discipline === 'sim' ? 'S' : x.kind === 'break' ? 'Z' : 'M'));
    expect(kinds.join('')).toBe('DPMMPSSZ');
  });

  it('Zeď a Start 0:3 + daň: vždy dvě kola, ve druhém stejné zápasy s prohozenými stranami', () => {
    const plan = autoPlan(DEFAULT_SELECTION, 180, 8, 4);
    expect(plan.wall! % 2).toBe(0);
    expect(plan.start03! % 2).toBe(0);
    expect(plan.wall).toBeGreaterThanOrEqual(2);
    for (const id of ['wall', 'start03'] as const) {
      const r = playRows(custom(8, 4, { plan: { [id]: 2 } }));
      const [a, b] = r.map((x) => x.cells.flatMap((c) => (c?.type === 'match' ? [c.match] : [])));
      expect(b.map((m) => [m.sideA, m.sideB])).toEqual(a.map((m) => [m.sideB, m.sideA]));
    }
  });

  it('Řetězec a Rozehrávka ze zadních tyčí se už nenabízí; Střelba z nastavení je Penalta z místa', () => {
    expect(DEFAULT_SELECTION).not.toContain('chain');
    expect(DEFAULT_SELECTION).not.toContain('backRodsBuildUp');
    const prev = custom(8, 4, { plan: { chain: 1, backRodsBuildUp: 1, normal: 2 } });
    const t = newTraining('n', '2026-11-03', prev, null);
    expect(t.plan.chain ?? 0).toBe(0);
    expect(t.plan.backRodsBuildUp ?? 0).toBe(0);
    expect(disc('setShooting').name).toBe('Penalta z místa');
    expect(t.simSplit).toBe('performance');
    // starý trénink s vyřazenou disciplínou se dál zobrazí
    expect(playRows(custom(8, 4, { plan: { backRodsBuildUp: 1 } }))[0].rule).toMatch(/^Rozehrávka ze zadních tyčí/);
  });
});
