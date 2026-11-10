import type { GameEvent, PlayerId } from './types';

const same = (a: GameEvent, b: GameEvent) => a.kind === b.kind && a.side === b.side && a.playerId === b.playerId;

/** Platné události v časovém pořadí: každá −1 zruší poslední odpovídající +1. */
export function effectiveEvents(events: GameEvent[]): GameEvent[] {
  const out: GameEvent[] = [];
  // Stabilní řazení podle času: při shodě zůstává pořadí, v jakém události vznikly (Zpět až po ťuknutí).
  for (const e of [...events].sort((x, y) => x.at - y.at)) {
    if (e.delta > 0) out.push(e);
    else {
      for (let i = out.length - 1; i >= 0; i--)
        if (same(out[i], e)) {
          out.splice(i, 1);
          break;
        }
    }
  }
  return out;
}

export interface ProgressStep {
  kind: 'goal' | 'loss';
  side: 'A' | 'B';
  at: number;
  /** Poloha na časové ose 0…1. */
  pos: number;
  /** Stav skóre po události včetně scénářového startu; ztráta ho nemění. */
  score: [number, number];
}

export interface MatchProgress {
  /** Osa: od zahájení (nebo prvního ťuknutí) do konce (nebo posledního ťuknutí). */
  start: number;
  end: number;
  /** Stav na začátku (scénářový start, jinak 0:0). */
  initial: [number, number];
  /** Góly a ztráty obou stran v časovém pořadí. */
  steps: ProgressStep[];
  /** Konečný stav. */
  score: [number, number];
  /** Největší náskok kterékoli strany, aspoň 2 – rozsah křivky vedení. */
  maxLead: number;
}

/** Kdo vede: A, B, nebo nikdo (nerozhodně). */
export const leader = ([a, b]: [number, number]): 'A' | 'B' | null => (a > b ? 'A' : b > a ? 'B' : null);

/**
 * Zápas (PRD 4.9, Sloupec / Křivka): góly a ztráty obou stran v jednom pořadí se stavem skóre po každé události.
 * U simulace jsou „góly“ vyhrané sety.
 */
export function matchProgress(events: GameEvent[], from: number, to: number, initial: [number, number] = [0, 0]): MatchProgress {
  const list = effectiveEvents(events).filter((e) => (e.kind === 'goal' || e.kind === 'loss') && (e.side === 'A' || e.side === 'B'));
  const start = Math.min(from, ...list.map((e) => e.at));
  const end = Math.max(to, ...list.map((e) => e.at), start + 1);
  let [a, b] = initial;
  let maxLead = Math.max(2, Math.abs(a - b));
  const steps = list.map((e): ProgressStep => {
    if (e.kind === 'goal') {
      if (e.side === 'A') a++;
      else b++;
      maxLead = Math.max(maxLead, Math.abs(a - b));
    }
    return { kind: e.kind as 'goal' | 'loss', side: e.side!, at: e.at, pos: (e.at - start) / (end - start), score: [a, b] };
  });
  return { start, end, initial: [...initial], steps, score: [a, b], maxLead };
}

export interface DrillRow {
  /** Pokusy po řadě: true = povedený (✓), false = nepovedený (✗). */
  marks: boolean[];
  /** Povedené celkem po každém pokusu (1, 2, 2, 3 …). */
  running: number[];
  /** Nejdelší série povedených (start = index prvního). */
  streak: { start: number; length: number } | null;
  /** Povedené v první a druhé polovině odehraných pokusů. */
  halves: [number, number];
}

/** Cvičení – pokusy po hráčích (PRD 4.9, Sloupec / Křivky). */
export function drillTimeline(events: GameEvent[], players: PlayerId[]): Record<PlayerId, DrillRow> {
  const list = effectiveEvents(events).filter((e) => e.kind === 'hit' || e.kind === 'miss');
  const out: Record<PlayerId, DrillRow> = {};
  for (const p of players) {
    const marks = list.filter((e) => e.playerId === p).map((e) => e.kind === 'hit');
    let best: DrillRow['streak'] = null;
    let run = 0;
    let hits = 0;
    const running = marks.map((ok) => (hits += ok ? 1 : 0));
    marks.forEach((ok, i) => {
      run = ok ? run + 1 : 0;
      if (run > 0 && (!best || run > best.length)) best = { start: i - run + 1, length: run };
    });
    const half = Math.ceil(marks.length / 2);
    out[p] = { marks, running, streak: best, halves: [marks.slice(0, half).filter(Boolean).length, marks.slice(half).filter(Boolean).length] };
  }
  return out;
}
