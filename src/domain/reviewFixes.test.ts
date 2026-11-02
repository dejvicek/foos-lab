import { buildSchedule } from './schedule';
import { computeStandings } from './standings';
import { computeSoloLadder } from './soloLadder';
import { autoPlan, DEFAULT_SELECTION } from './plan';
import { lockThrough } from './customSchedule';
import { newTraining } from './training';
import type { Training } from './types';
import { H, training } from '../test/fixtures';

const custom = (n: number, over: Partial<Training> = {}): Training => ({
  ...training('c', '2026-11-01', 'team', H(n), 4),
  format: 'custom',
  durationMin: 180,
  plan: autoPlan(DEFAULT_SELECTION, 180, n, 4),
  ...over,
});
const playRows = (t: Training) => buildSchedule(t).sections.flatMap((s) => s.rows).filter((r) => r.roundNo);

describe('opravy z kontroly', () => {
  it('hráč, který odešel, zůstává v souhrnu se svými zamčenými zápasy', () => {
    const t = custom(9);
    const s = buildSchedule(t);
    const row = playRows(t).find((r) => r.cells.some((c) => c?.type === 'match'))!;
    const m = row.cells.find((c) => c?.type === 'match');
    if (m?.type !== 'match') throw new Error();
    const leaver = m.match.sideA[0];
    const locked = lockThrough(s, [], row.roundNo!);
    const after: Training = { ...t, attendees: t.attendees.filter((p) => p !== leaver), lockedRounds: locked, scores: { [m.match.id]: { ga: 6, gb: 2 } } };
    const st = computeStandings(buildSchedule(after), after.scores, after.attendees);
    expect(st.rows.find((r) => r.playerId === leaver)).toMatchObject({ legs: 1, wins: 1 });
  });

  it('žebříček stanovišť přes 100 konfigurovatelných tréninků: rozpis se počítá jednou, další výpočty < 50 ms', () => {
    const base = custom(13);
    const ts = Array.from({ length: 100 }, (_, i) => ({ ...base, id: `t${i}`, date: '2026-10-20', soloResults: { H1: { 'setShooting@5': 10 } } }));
    const t0 = performance.now();
    computeSoloLadder(ts, { kind: 'all' }, 'avg', '2026-11-01');
    expect(performance.now() - t0).toBeLessThan(5000); // první výpočet staví 100 rozpisů (pomalé CI)
    const t1 = performance.now();
    computeSoloLadder(ts, { kind: 'all' }, 'total', '2026-11-01');
    expect(performance.now() - t1).toBeLessThan(50); // PRD 8: další překreslení
  });

  it('pozdní hráč po odehraných cvičeních nepřidá kola cvičení', () => {
    const t = custom(8);
    const rows = playRows(t);
    const drills = rows.filter((r) => r.kind === 'groups');
    const locked = lockThrough(buildSchedule(t), [], drills.at(-1)!.roundNo!);
    const plan = autoPlan(DEFAULT_SELECTION, 180, 9, 4, Object.fromEntries(locked.map((l) => [l.discipline, 1])), new Set(locked.map((l) => l.discipline)));
    for (const d of ['warmupPasses', 'fiveBarControl', 'setShooting', 'blockToControl'] as const) expect(plan[d]).toBe(1);
  });

  it('zamčené kolo s víc stoly se po snížení počtu stolů nerozjede', () => {
    const t = custom(8);
    const s = buildSchedule(t);
    const locked = lockThrough(s, [], 3);
    const after = buildSchedule({ ...t, tables: 2, lockedRounds: locked });
    const widest = Math.max(...after.sections.flatMap((x) => x.rows).map((r) => r.cells.length));
    expect(after.tables).toBe(widest);
  });

  it('nový konfigurovatelný trénink je vždy týmový (ne jedničky)', () => {
    const last = training('l', '2026-10-01', 'single', H(5), 2);
    expect(newTraining('x', '2026-11-01', last).mode).toBe('team');
  });
});
