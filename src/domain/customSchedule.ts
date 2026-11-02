import { discipline, type DisciplineDef } from './disciplines';
import { recordDrillRound, recordMatchRound, drillRound, matchRound, newCounters, type MatchPlan } from './pairing';
import { planSequence, planTimeline, FINAL_MIN, SIM_MIN_PLAYERS, type Plan } from './plan';
import { breakRow, matchId, simTeamsFor, type ScheduleInput } from './schedule';
import { simulateTeams } from './simulation';
import type {
  Cell,
  DisciplineId,
  LockedRound,
  Match,
  PlayerId,
  Schedule,
  ScheduleRow,
  ScheduleSection,
  TableCount,
} from './types';

const SIM_WAVE_MIN = 20;

function cellsOf(items: Cell[], tables: TableCount): (Cell | null)[] {
  return Array.from({ length: tables }, (_, j) => items[j] ?? null);
}

function matchCells(def: DisciplineDef, roundNo: number, plans: MatchPlan[], waiting: PlayerId[]): Cell[] {
  return plans.map((p, j) => {
    const referee = waiting[j];
    const match: Match = {
      id: matchId('league', roundNo, j + 1, p.a, p.b),
      block: 'league',
      round: roundNo,
      table: j + 1,
      kind: p.kind,
      sideA: p.a,
      sideB: p.b,
      discipline: def.id,
      lossTax: !!def.lossTax,
      trackLosses: true, // i v Dani a bez rozhodčího (rozhodnutí 2. 11. 2026)
    };
    if (referee) match.referee = referee;
    if (def.wall) match.wall = 'A';
    if (def.start) match.start = def.start;
    return { type: 'match', match };
  });
}

/** Znovu přehraje zamčené kolo do čítačů vyrovnávání. */
function replay(c: ReturnType<typeof newCounters>, locked: LockedRound, roundNo: number) {
  const def = discipline(locked.discipline);
  for (const row of locked.rows) {
    if (def.kind === 'drill') {
      const groups = row.cells.flatMap((x) => (x?.type === 'group' ? [x.players] : []));
      recordDrillRound(c, def, groups, row.waiting);
    } else if (def.kind === 'match') {
      const plans = row.cells.flatMap((x) =>
        x?.type === 'match' ? [{ kind: x.match.kind, a: x.match.sideA, b: x.match.sideB } as MatchPlan] : [],
      );
      recordMatchRound(c, def, plans, row.waiting, roundNo);
    }
  }
}

/** Pořadí kol tréninku: zamčená (odehraná) kola, pak zbývající podle plánu. */
export function roundSequence(t: ScheduleInput): DisciplineId[] {
  const locked = t.lockedRounds ?? [];
  const plan: Plan = t.plan ?? {};
  const lockedCount = new Map<DisciplineId, number>();
  for (const l of locked) lockedCount.set(l.discipline, (lockedCount.get(l.discipline) ?? 0) + 1);
  const remaining: Plan = {};
  for (const [id, n] of Object.entries(plan) as [DisciplineId, number][])
    remaining[id] = Math.max(0, n - (lockedCount.get(id) ?? 0));
  if (locked.some((l) => l.discipline === 'sim') || t.attendees.length < SIM_MIN_PLAYERS) remaining.sim = 0;
  return [...locked.map((l) => l.discipline), ...planSequence(remaining)];
}

/** PRD 4.6 + 5.10: rozpis konfigurovatelného tréninku. Zamčená kola jsou vstupem a nemění se. */
export function buildCustomSchedule(t: ScheduleInput): Schedule {
  const players = t.attendees;
  const locked = t.lockedRounds ?? [];
  // Zamčená kola mohla mít víc stolů – tabulka musí mít sloupce i pro ně.
  const widest = Math.max(0, ...locked.flatMap((l) => l.rows.map((r) => r.cells.length)));
  const tables = Math.max(t.tables, widest) as TableCount;
  const c = newCounters();
  locked.forEach((l, i) => replay(c, l, i + 1));
  const seq = roundSequence(t);
  const drillsLeft = new Map<DisciplineId, number>();
  for (const id of seq.slice(locked.length)) drillsLeft.set(id, (drillsLeft.get(id) ?? 0) + 1);

  const timeline = planTimeline(seq, t.breaks);
  // Sekce jdou chronologicky: při změně druhu kola začne nová (cvičení přidané později je za zápasy).
  const META = {
    drills: { title: 'Cvičení', waitingLabel: 'Počítá' },
    matches: { title: 'Zápasy', waitingLabel: 'Rozhodčí / čeká' },
    sim: { title: 'Simulace ligového kola', waitingLabel: 'Čeká' },
  } as const;
  const out: ScheduleSection[] = [];
  const push = (kind: 'drills' | 'matches' | 'sim', row: ScheduleRow) => {
    const last = out.at(-1);
    if (last && last.id === kind) last.rows.push(row);
    else out.push({ id: kind, ...META[kind], rows: [row] });
  };
  const pushBreak = (row: ScheduleRow) => {
    const last = out.at(-1);
    if (last) last.rows.push(row);
    else out.push({ id: 'drills', ...META.drills, rows: [row] });
  };
  const matches: Match[] = [];
  let teams: { A: PlayerId[]; B: PlayerId[] } | null = null;
  let simDoubles = 0;
  let simSingles = 0;
  let roundNo = 0;

  for (const item of timeline.items) {
    if (item.kind === 'break') {
      pushBreak({ ...breakRow(item.start, 'Pauza', tables, `${item.min} min`), breakIndex: item.index });
      continue;
    }
    if (item.kind === 'final') {
      pushBreak(breakRow(item.start, 'Zápis a vyhodnocení', tables, `${FINAL_MIN} min`));
      continue;
    }
    roundNo++;
    const def = discipline(item.discipline!);
    const kind = def.kind === 'drill' ? 'drills' : def.kind === 'match' ? 'matches' : 'sim';
    const label = `${roundNo}. kolo`;
    const rule = `${def.name}, ${def.min} min`;
    const lockedRound = roundNo <= locked.length ? locked[roundNo - 1] : null;

    if (def.kind === 'sim') {
      let simRows: ScheduleRow[];
      if (lockedRound)
        simRows = lockedRound.rows.map((r, w) => ({ ...r, cells: cellsOf(r.cells.filter(Boolean) as Cell[], tables), time: item.start + w * SIM_WAVE_MIN }));
      else {
        teams = simTeamsFor({ ...t, attendees: players }, matches.filter((m) => m.block === 'league'));
        const sim = simulateTeams(teams.A, teams.B, t.tables);
        simDoubles = sim.wave1.doubles + sim.wave2.doubles;
        simSingles = sim.wave1.singles + sim.wave2.singles;
        simRows = [sim.wave1, sim.wave2].map((w, wi) => ({
          roundNo,
          discipline: 'sim' as const,
          time: item.start + wi * SIM_WAVE_MIN,
          label: `${wi + 1}. vlna`,
          rule: `${SIM_WAVE_MIN} min, ligový formát`,
          kind: 'matches' as const,
          cells: cellsOf(
            w.matches.map((p, j) => ({
              type: 'match' as const,
              match: {
                id: matchId('sim', wi + 1, j + 1, p.a, p.b),
                block: 'sim' as const,
                round: wi + 1,
                table: j + 1,
                kind: p.kind,
                sideA: p.a,
                sideB: p.b,
                discipline: 'sim' as const,
              },
            })),
            tables,
          ),
          waiting: [...w.restA, ...w.restB],
        }));
      }
      if (!teams && simRows.length) {
        const first = simRows[0].cells.flatMap((x) => (x?.type === 'match' ? [x.match] : []));
        teams = { A: [...new Set(first.flatMap((m) => m.sideA))], B: [...new Set(first.flatMap((m) => m.sideB))] };
      }
      for (const r of simRows) {
        for (const x of r.cells) if (x?.type === 'match') matches.push(x.match);
        push('sim', r);
      }
      continue;
    }

    let row: ScheduleRow;
    if (lockedRound) {
      const lr = lockedRound.rows[0];
      row = { ...lr, cells: cellsOf(lr.cells.filter(Boolean) as Cell[], tables), roundNo, discipline: def.id, time: item.start, label, rule };
    } else if (def.kind === 'drill') {
      const left = drillsLeft.get(def.id) ?? 1;
      drillsLeft.set(def.id, left - 1);
      const r = drillRound(players, t.tables, def, c, roundNo, left);
      row = {
        roundNo,
        discipline: def.id,
        time: item.start,
        label,
        rule,
        kind: 'groups',
        cells: cellsOf(
          r.groups.map((g) => ({ type: 'group', players: g, station: def.name, metric: def.metric, soloRound: roundNo, discipline: def.id })),
          tables,
        ),
        waiting: r.waiting,
      };
    } else {
      const r = matchRound(players, t.tables, def, c, roundNo);
      row = {
        roundNo,
        discipline: def.id,
        time: item.start,
        label,
        rule,
        kind: 'matches',
        cells: cellsOf(matchCells(def, roundNo, r.matches, r.waiting), tables),
        waiting: r.waiting,
      };
    }
    for (const x of row.cells) if (x?.type === 'match') matches.push(x.match);
    push(kind, row);
  }

  const firstMatch = out.filter((x) => x.id === 'matches').flatMap((x) => x.rows).find((r) => r.kind === 'matches');
  const doubles = firstMatch ? firstMatch.cells.filter((x) => x?.type === 'match' && x.match.kind === 'doubles').length : 0;
  const singles = firstMatch ? firstMatch.cells.filter((x) => x?.type === 'match' && x.match.kind === 'singles').length : 0;
  return {
    mode: t.mode,
    tables,
    sections: out,
    matches,
    teams,
    summary: {
      stationGroups: 0,
      doublesPerRound: doubles,
      singlesPerRound: singles,
      waitingPerRound: firstMatch?.waiting.length ?? 0,
      simDoubles,
      simSingles,
    },
  };
}

/** Zamkne kola 1…roundNo (PRD 4.6: odehraná kola se už nemění). Vrací nový seznam zamčených kol. */
export function lockThrough(schedule: Schedule, locked: LockedRound[], roundNo: number): LockedRound[] {
  if (roundNo <= locked.length) return locked;
  const byRound = new Map<number, ScheduleRow[]>();
  for (const sec of schedule.sections)
    for (const row of sec.rows)
      if (row.roundNo !== undefined && row.roundNo <= roundNo) byRound.set(row.roundNo, [...(byRound.get(row.roundNo) ?? []), row]);
  const out: LockedRound[] = [];
  for (let k = 1; k <= roundNo; k++) {
    const rows = byRound.get(k);
    if (!rows) break;
    out.push({ discipline: rows[0].discipline!, rows });
  }
  return out;
}

/** Číslo kola, do kterého patří zápas nebo výsledek (pro zamykání). */
export function roundOfMatch(schedule: Schedule, matchIdValue: string): number | null {
  for (const sec of schedule.sections)
    for (const row of sec.rows)
      if (row.cells.some((c) => c?.type === 'match' && c.match.id === matchIdValue)) return row.roundNo ?? null;
  return null;
}
