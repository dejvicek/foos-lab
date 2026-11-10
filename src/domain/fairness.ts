import { DISCIPLINES, discipline } from './disciplines';
import { pairKey } from './pairing';
import { buildSchedule, type ScheduleInput } from './schedule';
import type { DisciplineId, PlayerId, Schedule } from './types';

/** Kontrola spravedlnosti rozpisu (jen pro admina): kdo s kým kolikrát hrál ve dvojici a proti sobě. */
export interface Fairness {
  together(a: PlayerId, b: PlayerId): number;
  against(a: PlayerId, b: PlayerId): number;
  /** Zápasy hráče (bez simulace). */
  games: Map<PlayerId, number>;
  /** Kola zápasů, kdy byl mimo stůl (čekal / rozhodoval). */
  sits: Map<PlayerId, number>;
  maxTogether: number;
  maxAgainst: number;
}

/** Počítá zápasy rozpisu mimo simulaci (ta má pevné týmy). */
export function fairness(s: Schedule, players: PlayerId[]): Fairness {
  const together = new Map<string, number>();
  const against = new Map<string, number>();
  const games = new Map<PlayerId, number>(players.map((p) => [p, 0]));
  const sits = new Map<PlayerId, number>(players.map((p) => [p, 0]));
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const match of s.matches) {
    if (match.block === 'sim') continue;
    for (const side of [match.sideA, match.sideB])
      for (let i = 0; i < side.length; i++) for (let j = i + 1; j < side.length; j++) inc(together, pairKey(side[i], side[j]));
    for (const a of match.sideA) for (const b of match.sideB) inc(against, pairKey(a, b));
    for (const p of [...match.sideA, ...match.sideB]) games.set(p, (games.get(p) ?? 0) + 1);
  }
  for (const sec of s.sections) {
    if (sec.id === 'sim') continue;
    for (const row of sec.rows) if (row.kind === 'matches') for (const p of row.waiting) sits.set(p, (sits.get(p) ?? 0) + 1);
  }
  return {
    together: (a, b) => together.get(pairKey(a, b)) ?? 0,
    against: (a, b) => against.get(pairKey(a, b)) ?? 0,
    games,
    sits,
    maxTogether: Math.max(0, ...together.values()),
    maxAgainst: Math.max(0, ...against.values()),
  };
}

export interface FairnessAdvice {
  /** Hraje se ve dvojicích (aspoň 4 hráči)? Bez dvojic spolu hrát nejde. */
  doubles: boolean;
  /** Dvojice hráčů, které spolu nikdy nehrají / nikdy proti sobě. */
  neverWith: number;
  neverAgainst: number;
  pairs: number;
  /** Které kolo přidávat: vybraná nepárová disciplína dvojic, jinak Normální leg. */
  discipline: DisciplineId;
  /** Je ta disciplína už vybraná (jde rovnou přidat kola)? */
  selected: boolean;
  /** Kolik kol přidat, aby spolu / proti sobě hrál každý s každým; 0 = už je; null = ani s maxExtra koly. */
  addForWith: number | null;
  addForAgainst: number | null;
}

export const neverCount = (f: Fairness, players: PlayerId[], kind: 'together' | 'against') => {
  let n = 0;
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) if (f[kind](players[i], players[j]) === 0) n++;
  return n;
};

/**
 * Nápověda k nastavení: kolik kol zápasu dvojic přidat, aby spolu i proti sobě hrál každý s každým.
 * Počítá skutečným sestavením rozpisu s koly navíc (vyrovnávání je deterministické), nejvýš `maxExtra`.
 */
export function fairnessAdvice(t: ScheduleInput, maxExtra = 20): FairnessAdvice {
  const players = t.attendees;
  const plan = t.plan ?? {};
  const candidates = DISCIPLINES.filter((d) => d.kind === 'match' && !d.paired && !d.singlesOnly && !d.retired);
  const chosen = candidates.find((d) => (plan[d.id] ?? 0) > 0) ?? discipline('normal');
  const doubles = players.length >= 4;
  const at = (extra: number) => fairness(buildSchedule({ ...t, plan: { ...plan, [chosen.id]: (plan[chosen.id] ?? 0) + extra } }), players);
  const now = at(0);
  const out: FairnessAdvice = {
    doubles,
    neverWith: doubles ? neverCount(now, players, 'together') : 0,
    neverAgainst: neverCount(now, players, 'against'),
    pairs: (players.length * (players.length - 1)) / 2,
    discipline: chosen.id,
    selected: (plan[chosen.id] ?? 0) > 0,
    addForWith: null,
    addForAgainst: null,
  };
  if (!doubles || out.neverWith === 0) out.addForWith = doubles ? 0 : null;
  if (out.neverAgainst === 0) out.addForAgainst = 0;
  for (let k = 1; k <= maxExtra && ((doubles && out.addForWith === null) || out.addForAgainst === null); k++) {
    const f = at(k);
    if (doubles && out.addForWith === null && neverCount(f, players, 'together') === 0) out.addForWith = k;
    if (out.addForAgainst === null && neverCount(f, players, 'against') === 0) out.addForAgainst = k;
  }
  return out;
}
