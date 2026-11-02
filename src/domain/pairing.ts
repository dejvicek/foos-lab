import type { DisciplineDef } from './disciplines';
import type { MatchKind, PlayerId } from './types';

/**
 * PRD 5.10: vyrovnané sestavy. Čítače se vedou přes celý trénink, kolo po kole.
 * Vše deterministické: pevné pořadí, žádná náhoda.
 */
export interface Counters {
  partner: Map<string, number>;
  opponent: Map<string, number>;
  sit: Map<PlayerId, number>;
  lastSit: Map<PlayerId, number>;
  singles: Map<PlayerId, number>;
  left: Map<PlayerId, number>;
  wallHold: Map<PlayerId, number>;
  wallBreak: Map<PlayerId, number>;
  behind: Map<PlayerId, number>;
  ahead: Map<PlayerId, number>;
  /** `${drill}|${player}` → kolikrát cvičení hrál */
  drillPlayed: Map<string, number>;
  drillSit: Map<PlayerId, number>;
  drillPartner: Map<string, number>;
}

export const newCounters = (): Counters => ({
  partner: new Map(),
  opponent: new Map(),
  sit: new Map(),
  lastSit: new Map(),
  singles: new Map(),
  left: new Map(),
  wallHold: new Map(),
  wallBreak: new Map(),
  behind: new Map(),
  ahead: new Map(),
  drillPlayed: new Map(),
  drillSit: new Map(),
  drillPartner: new Map(),
});

export const pairKey = (a: PlayerId, b: PlayerId) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const get = <K>(m: Map<K, number>, k: K) => m.get(k) ?? 0;
const inc = <K>(m: Map<K, number>, k: K, by = 1) => m.set(k, get(m, k) + by);

export interface MatchPlan {
  kind: MatchKind;
  /** Levá strana (u Zdi drží zeď, u startu 0:3 začíná pozadu). */
  a: PlayerId[];
  b: PlayerId[];
}

/** Tvar kola jako 5.2: nejdřív dvojice, pak singly. */
function shape(n: number, tables: number, singlesOnly: boolean) {
  const doubles = singlesOnly ? 0 : Math.min(tables, Math.floor(n / 4));
  const singles = Math.min(tables - doubles, Math.floor((n - 4 * doubles) / 2));
  return { doubles, singles, playing: 4 * doubles + 2 * singles };
}

type Role = 'wall' | 'start' | null;
const roleOf = (def: DisciplineDef): Role => (def.wall ? 'wall' : def.start && def.start[0] !== def.start[1] ? 'start' : null);

/** Cena role pro stranu `first`, která roli „drží“ (zeď / začíná pozadu). */
function roleCost(c: Counters, role: Role, holders: PlayerId[], others: PlayerId[]): number {
  if (!role) return 0;
  const [h, o] = role === 'wall' ? [c.wallHold, c.wallBreak] : [c.behind, c.ahead];
  let cost = 0;
  for (const p of holders) {
    const d = get(h, p) + 1 - get(o, p);
    cost += (Math.abs(d) > 1 ? 10 : 0) + 0.5 * Math.abs(d);
  }
  for (const p of others) {
    const d = get(h, p) - (get(o, p) + 1);
    cost += (Math.abs(d) > 1 ? 10 : 0) + 0.5 * Math.abs(d);
  }
  return cost;
}

function orient(c: Counters, role: Role, x: PlayerId[], y: PlayerId[]): { a: PlayerId[]; b: PlayerId[]; cost: number } {
  if (role) {
    const cx = roleCost(c, role, x, y);
    const cy = roleCost(c, role, y, x);
    return cy < cx ? { a: y, b: x, cost: cy } : { a: x, b: y, cost: cx };
  }
  const lx = x.reduce((s, p) => s + get(c.left, p), 0);
  const ly = y.reduce((s, p) => s + get(c.left, p), 0);
  return ly < lx ? { a: y, b: x, cost: 0 } : { a: x, b: y, cost: 0 };
}

function matchCost(c: Counters, role: Role, x: PlayerId[], y: PlayerId[]): number {
  let cost = 0;
  if (x.length === 2) cost += 3 * (get(c.partner, pairKey(x[0], x[1])) + get(c.partner, pairKey(y[0], y[1])));
  else cost += 2 * (get(c.singles, x[0]) + get(c.singles, y[0]));
  for (const p of x) for (const q of y) cost += get(c.opponent, pairKey(p, q));
  return cost + orient(c, role, x, y).cost;
}

function split(slots: PlayerId[], doubles: number, singles: number): [PlayerId[], PlayerId[]][] {
  const out: [PlayerId[], PlayerId[]][] = [];
  for (let d = 0; d < doubles; d++) out.push([slots.slice(4 * d, 4 * d + 2), slots.slice(4 * d + 2, 4 * d + 4)]);
  for (let s = 0; s < singles; s++) {
    const i = 4 * doubles + 2 * s;
    out.push([[slots[i]], [slots[i + 1]]]);
  }
  return out;
}

/** Lokální zlepšování výměnou dvou pozic, dokud se cena snižuje (pevné pořadí zkoušení). */
function improve(slots: PlayerId[], cost: (s: PlayerId[]) => number): PlayerId[] {
  let best = [...slots];
  let bestCost = cost(best);
  for (let pass = 0; pass < 40; pass++) {
    let changed = false;
    for (let i = 0; i < best.length; i++)
      for (let j = i + 1; j < best.length; j++) {
        const cand = [...best];
        [cand[i], cand[j]] = [cand[j], cand[i]];
        const cc = cost(cand);
        if (cc < bestCost - 1e-9) {
          best = cand;
          bestCost = cc;
          changed = true;
        }
      }
    if (!changed) break;
  }
  return best;
}

const rotateBy = <T>(arr: T[], k: number) => (arr.length ? arr.slice(k % arr.length).concat(arr.slice(0, k % arr.length)) : arr);

/** Zapíše odehrané kolo zápasu do čítačů (i pro zamčená kola). */
export function recordMatchRound(c: Counters, def: DisciplineDef, matches: MatchPlan[], waiting: PlayerId[], roundNo: number) {
  const role = roleOf(def);
  for (const m of matches) {
    if (m.kind === 'doubles') {
      inc(c.partner, pairKey(m.a[0], m.a[1]));
      inc(c.partner, pairKey(m.b[0], m.b[1]));
    } else for (const p of [...m.a, ...m.b]) inc(c.singles, p);
    for (const p of m.a) for (const q of m.b) inc(c.opponent, pairKey(p, q));
    for (const p of m.a) inc(c.left, p);
    if (role === 'wall') {
      m.a.forEach((p) => inc(c.wallHold, p));
      m.b.forEach((p) => inc(c.wallBreak, p));
    }
    if (role === 'start') {
      m.a.forEach((p) => inc(c.behind, p));
      m.b.forEach((p) => inc(c.ahead, p));
    }
  }
  for (const p of waiting) {
    inc(c.sit, p);
    c.lastSit.set(p, roundNo);
  }
}

/** Jedno kolo zápasové disciplíny: kdo nehraje, kdo s kým a proti komu, strany. */
export function matchRound(
  players: PlayerId[],
  tables: number,
  def: DisciplineDef,
  c: Counters,
  roundNo: number,
): { matches: MatchPlan[]; waiting: PlayerId[] } {
  const { doubles, singles, playing } = shape(players.length, tables, !!def.singlesOnly);
  const order = new Map(players.map((p, i) => [p, i]));
  // Nehrají ti, kdo nehráli nejméně; při shodě ti, kdo nehráli nejdéle; pak pořadí přítomných.
  const bySit = [...players].sort(
    (x, y) => get(c.sit, x) - get(c.sit, y) || (c.lastSit.get(x) ?? -1) - (c.lastSit.get(y) ?? -1) || order.get(x)! - order.get(y)!,
  );
  const waiting = bySit.slice(0, players.length - playing).sort((x, y) => order.get(x)! - order.get(y)!);
  const sitting = new Set(waiting);
  const active = rotateBy(players.filter((p) => !sitting.has(p)), roundNo);
  const role = roleOf(def);
  const total = (s: PlayerId[]) => split(s, doubles, singles).reduce((sum, [x, y]) => sum + matchCost(c, role, x, y), 0);
  const slots = improve(active, total);
  const matches: MatchPlan[] = split(slots, doubles, singles).map(([x, y]) => {
    const o = orient(c, role, x, y);
    return { kind: x.length === 2 ? 'doubles' : 'singles', a: o.a, b: o.b };
  });
  recordMatchRound(c, def, matches, waiting, roundNo);
  return { matches, waiting };
}

/** Zapíše kolo cvičení do čítačů. */
export function recordDrillRound(c: Counters, def: DisciplineDef, groups: PlayerId[][], waiting: PlayerId[]) {
  for (const g of groups) {
    for (const p of g) inc(c.drillPlayed, `${def.id}|${p}`);
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) inc(c.drillPartner, pairKey(g[i], g[j]));
  }
  for (const p of waiting) inc(c.drillSit, p);
}

/**
 * Jedno kolo cvičení: dvojice u stolu. Přednost mají ti, kdo cvičení ještě nehráli.
 * Lichý počet: když je volné místo, přibere se sparing partner (už hrál); jinak je u posledního
 * stolu trojice. Sám hraje jen hráč v tréninku pro 1.
 */
export function drillRound(
  players: PlayerId[],
  tables: number,
  def: DisciplineDef,
  c: Counters,
  roundNo: number,
  roundsLeft: number,
): { groups: PlayerId[][]; waiting: PlayerId[] } {
  const cap = 2 * tables;
  const order = new Map(players.map((p, i) => [p, i]));
  const played = (p: PlayerId) => get(c.drillPlayed, `${def.id}|${p}`);
  const sorted = [...players].sort(
    (x, y) => played(x) - played(y) || get(c.drillSit, y) - get(c.drillSit, x) || order.get(x)! - order.get(y)!,
  );
  const fresh = players.filter((p) => played(p) === 0).length;
  let target = Math.min(fresh > 0 ? Math.ceil(fresh / Math.max(1, roundsLeft)) : cap, players.length);
  if (target % 2 && target + 1 <= Math.min(cap, players.length)) target++;
  if (target > cap + 1 || (target > cap && target % 2 === 0)) target = cap;
  const chosen = sorted.slice(0, target);
  const waiting = sorted.slice(target).sort((x, y) => order.get(x)! - order.get(y)!);
  const toGroups = (s: PlayerId[]) => {
    if (s.length === 1) return [[s[0]]]; // trénink pro 1 hráče
    const gs: PlayerId[][] = [];
    for (let i = 0; i + 1 < s.length; i += 2) gs.push([s[i], s[i + 1]]);
    if (s.length % 2) gs[gs.length - 1].push(s[s.length - 1]); // trojice u posledního stolu
    return gs;
  };
  const cost = (s: PlayerId[]) =>
    toGroups(s).reduce((sum, g) => {
      let x = 0;
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) x += get(c.drillPartner, pairKey(g[i], g[j]));
      return sum + x;
    }, 0);
  const groups = toGroups(improve(rotateBy(chosen, roundNo), cost));
  recordDrillRound(c, def, groups, waiting);
  return { groups, waiting };
}
