import { buildSchedule } from './schedule';
import { autoPlan, drillRoundsNeeded } from './plan';
import type { Match, ScheduleRow, TableCount, Training } from './types';
import { newTraining } from './training';
import { discipline as disc } from './disciplines';
import { DEFAULT_SELECTION, H } from '../test/fixtures';

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
  it('kolo = jedna disciplína pro všechny stoly; cvičení, zápasy, simulace; bez Zápisu na konci (9. 11. 2026)', () => {
    const s = buildSchedule(custom(8, 4));
    expect(s.sections.map((x) => x.id)).toEqual(['drills', 'matches', 'sim']);
    for (const r of playRows(custom(8, 4))) {
      const ds = new Set(r.cells.filter(Boolean).map((c) => (c!.type === 'match' ? c!.match.discipline : c!.discipline)));
      expect(ds.size).toBe(1);
    }
    const all = rows(custom(8, 4));
    expect(all.some((r) => r.label === 'Zápis a vyhodnocení')).toBe(false);
    expect(all.at(-1)!.discipline).toBe('sim');
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
  it('jen v Dani za ztrátu (18. 11. 2026): Start 0:3 bez Daně, ostatní zápasy a simulace bez ztrát', () => {
    const s = buildSchedule(custom(8, 4, { plan: { start03: 1, lossTax: 1, normal: 1, singles: 1, sim: 1 } }));
    const league = s.matches.filter((m) => m.block === 'league');
    const tax = league.filter((m) => m.discipline === 'lossTax');
    expect(tax.length).toBeGreaterThan(0);
    expect(tax.every((m) => m.trackLosses && m.lossTax)).toBe(true);
    expect(league.filter((m) => m.discipline !== 'lossTax').every((m) => !m.trackLosses && !m.lossTax)).toBe(true);
    expect(league.some((m) => m.discipline === 'start03')).toBe(true);
    expect(s.matches.filter((m) => m.block === 'sim').every((m) => !m.trackLosses)).toBe(true);
  });

  it('Daň vždy s rozhodčím u každého stolu: dvojice + rozhodčí = 5, singl + rozhodčí = 3', () => {
    const taxRound = (n: number, tables: TableCount) =>
      buildSchedule(custom(n, tables, { plan: { lossTax: 1 } })).matches.filter((m) => m.discipline === 'lossTax');
    const shape = (ms: ReturnType<typeof taxRound>) => ms.map((m) => m.kind);
    // 8 hráčů, 4 stoly: dvojice + singl, 2 rozhodčí (bez pravidla by byly 2 dvojice bez rozhodčího)
    expect(shape(taxRound(8, 4))).toEqual(['doubles', 'singles']);
    // 12 hráčů, 4 stoly: 2 dvojice + 2 rozhodčí, 2 čekají
    expect(shape(taxRound(12, 4))).toEqual(['doubles', 'doubles']);
    // 13 hráčů: 2 dvojice + singl (5 + 5 + 3)
    expect(shape(taxRound(13, 4))).toEqual(['doubles', 'doubles', 'singles']);
    // 4 hráči: singl + rozhodčí, jeden čeká
    expect(shape(taxRound(4, 2))).toEqual(['singles']);
    for (const n of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
      for (const t of [2, 3, 4] as TableCount[]) {
        const ms = taxRound(n, t);
        expect(ms.length, `${n}/${t}`).toBeGreaterThan(0);
        expect(ms.every((m) => m.referee), `${n}/${t}`).toBe(true);
        const refs = ms.map((m) => m.referee);
        expect(new Set(refs).size).toBe(refs.length);
        for (const m of ms) expect([...m.sideA, ...m.sideB]).not.toContain(m.referee);
      }
  });

  it('Daň se pro 2 hráče nehraje (chybí rozhodčí); ostatní disciplíny beze změny tvaru', () => {
    expect(buildSchedule(custom(2, 2, { plan: { lossTax: 1, normal: 1 } })).matches.some((m) => m.discipline === 'lossTax')).toBe(false);
    expect(buildSchedule(custom(8, 4, { plan: { normal: 1 } })).matches.map((m) => m.kind)).toEqual(['doubles', 'doubles']);
  });

  it('starší trénink: zamčené kolo Start 0:3 + daň a ztráty u Normálního legu se srovnají (bez Daně, bez ztrát)', () => {
    const base = buildSchedule(custom(8, 4, { plan: { start03: 1, normal: 1 } }));
    const old = (m: Match): Match => ({ ...m, trackLosses: true, ...(m.discipline === 'start03' ? { lossTax: true } : {}) });
    const rows = base.sections.flatMap((s) => s.rows).filter((r) => r.kind === 'matches');
    const lockedRounds = rows.map((r) => ({
      discipline: (r.cells.find((c) => c?.type === 'match') as { match: Match }).match.discipline!,
      rows: [{ ...r, cells: r.cells.map((c) => (c?.type === 'match' ? { ...c, match: old(c.match) } : c)) }],
    }));
    const s = buildSchedule(custom(8, 4, { plan: { start03: 1, normal: 1 }, lockedRounds }));
    expect(s.matches.length).toBeGreaterThan(0);
    expect(s.matches.every((m) => !m.trackLosses && !m.lossTax)).toBe(true);
    const cells = s.sections.flatMap((x) => x.rows).flatMap((r) => r.cells).flatMap((c) => (c?.type === 'match' ? [c.match] : []));
    expect(cells.every((m) => !m.trackLosses && !m.lossTax)).toBe(true);
  });
});

it('nový trénink má dnešní datum', () => {
  expect(newTraining('x', '2026-11-03', custom(8, 4, { date: '2026-10-01' }), null).date).toBe('2026-11-03');
});

describe('úpravy plánu 2. 11. 2026', () => {
  it('výchozí pauzy po sekcích: po cvičeních a po zápasech (před simulací)', () => {
    const r = rows(custom(8, 4, { plan: { warmupPasses: 1, normal: 2, sim: 1 } }));
    const kinds = r.map((x) => (x.label === 'Pauza' ? 'P' : x.kind === 'groups' ? 'D' : x.discipline === 'sim' ? 'S' : x.kind === 'break' ? 'Z' : 'M'));
    expect(kinds.join('')).toBe('DPMMPSS');
  });

  it('Zeď a Start 0:3 + daň: vždy dvě kola, ve druhém stejné zápasy s prohozenými stranami', () => {
    const plan = autoPlan(DEFAULT_SELECTION, 180, 8, 4);
    expect(plan.wall! % 2).toBe(0);
    expect(plan.start03! % 2).toBe(0);
    expect(plan.wall).toBeGreaterThanOrEqual(2);
    for (const id of ['wall', 'start03', 'start45'] as const) {
      const r = playRows(custom(8, 4, { plan: { [id]: 2 } }));
      const [a, b] = r.map((x) => x.cells.flatMap((c) => (c?.type === 'match' ? [c.match] : [])));
      expect(b.map((m) => [m.sideA, m.sideB])).toEqual(a.map((m) => [m.sideB, m.sideA]));
    }
  });

  it('Rozehrávka ze zadních tyčí se už nenabízí; stará Penalta z místa (20 střel) jen v historii', () => {
    const prev = custom(8, 4, { plan: { backRodsBuildUp: 1, normal: 2 } });
    const t = newTraining('n', '2026-11-03', prev, null);
    expect(t.plan.backRodsBuildUp ?? 0).toBe(0);
    expect(disc('setShooting').name).toBe('Penalta z místa (20 střel)');
    expect(disc('penaltyKeeper').name).toBe('Penalta z místa proti brankáři');
    expect(t.simSplit).toBe('performance');
    // starý trénink s vyřazenou disciplínou se dál zobrazí
    expect(playRows(custom(8, 4, { plan: { backRodsBuildUp: 1 } }))[0].rule).toMatch(/^Rozehrávka ze zadních tyčí/);
  });
});

describe('Řetězec (10. 11. 2026)', () => {
  it('nabízí se, s bránícím soupeřem, kola po 8 min, metrika góly z 20', () => {
    expect(disc('chain')).toMatchObject({ kind: 'drill', min: 8, needsPartner: true, metric: 'chain' });
    expect(disc('chain').variants).toBeUndefined();
    expect(disc('chain').retired).toBeUndefined();
  });

  it('jedno kolo (ne po dvou): kolik kol, tolik nových dvojic; na konci cvičení', () => {
    const r = playRows(custom(8, 2, { plan: { normal: 1, chain: 2, warmupPasses: 2 } }));
    expect(r.map((x) => x.discipline)).toEqual(['warmupPasses', 'warmupPasses', 'chain', 'chain', 'normal']);
    const groups = (x: ScheduleRow) => x.cells.flatMap((c) => (c?.type === 'group' ? [c.players] : []));
    const [a, b] = r.filter((x) => x.discipline === 'chain');
    // 2 stoly × 2 hráči, 8 hráčů → za 2 kola se vystřídají všichni
    expect(new Set([...groups(a), ...groups(b)].flat()).size).toBe(8);
    expect(a.rule).toBe('Řetězec, 8 min');
  });

  it('výchozí počet kol jako u cvičení (tolik, aby se všichni vystřídali), krok 1', () => {
    for (let n = 4; n <= 13; n++)
      for (const tables of [2, 3, 4] as TableCount[]) {
        const plan = autoPlan([...DEFAULT_SELECTION, 'chain'], 180, n, tables);
        expect(plan.chain, `n=${n} t=${tables}`).toBe(drillRoundsNeeded(n, tables));
      }
  });
});

describe('trénink na 1 stůl', () => {
  it('n=4..13: v každém kole nejvýš jedno utkání / skupina, ostatní mimo stůl; každý si zahraje každé cvičení', () => {
    for (let n = 4; n <= 13; n++) {
      const t = custom(n, 1, { plan: autoPlan(DEFAULT_SELECTION, 180, n, 1) });
      const s = buildSchedule(t);
      expect(s.tables).toBe(1);
      for (const r of playRows(t)) {
        expect(r.cells).toHaveLength(1);
        if (r.discipline === 'sim') continue;
        const inRow = [...r.cells.flatMap((c) => (!c ? [] : c.type === 'match' ? [...c.match.sideA, ...c.match.sideB] : c.players)), ...r.waiting];
        expect([...inRow].sort()).toEqual([...H(n)].sort());
      }
      const drills = new Set(playRows(t).filter((r) => r.kind === 'groups').map((r) => r.discipline));
      for (const d of drills)
        for (const p of H(n))
          expect(playRows(t).some((r) => r.discipline === d && r.cells.some((c) => c?.type === 'group' && c.players.includes(p)))).toBe(true);
    }
  });
});
