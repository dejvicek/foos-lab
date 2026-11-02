import type { GameEvent, PlayerId } from './types';

const same = (a: GameEvent, b: GameEvent) => a.kind === b.kind && a.side === b.side && a.playerId === b.playerId;

/** Platné události v časovém pořadí: každá −1 zruší poslední odpovídající +1. */
export function effectiveEvents(events: GameEvent[]): GameEvent[] {
  const out: GameEvent[] = [];
  for (const e of [...events].sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1))) {
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

export interface LaneMark {
  kind: 'goal' | 'loss';
  /** Pořadí gólu strany (1, 2, …); u ztráty null. */
  n: number | null;
  /** Poloha na časové ose 0…1. */
  pos: number;
  at: number;
}

/** Zápas – dvě dráhy (PRD 4.9, varianta B): góly a ztráty levé / pravé strany na společné časové ose. */
export function matchTimeline(events: GameEvent[], from: number, to: number) {
  const list = effectiveEvents(events).filter((e) => e.kind === 'goal' || e.kind === 'loss');
  const start = Math.min(from, ...list.map((e) => e.at));
  const end = Math.max(to, ...list.map((e) => e.at), start + 1);
  const lane = (side: 'A' | 'B'): LaneMark[] => {
    let n = 0;
    return list
      .filter((e) => e.side === side)
      .map((e) => ({ kind: e.kind as 'goal' | 'loss', n: e.kind === 'goal' ? ++n : null, pos: (e.at - start) / (end - start), at: e.at }));
  };
  const A = lane('A');
  const B = lane('B');
  return { A, B, start, end, score: [A.filter((x) => x.kind === 'goal').length, B.filter((x) => x.kind === 'goal').length] as [number, number] };
}

export interface DrillRow {
  /** Pokusy po řadě: true = povedený (✓), false = nepovedený (✗). */
  marks: boolean[];
  /** Nejdelší série povedených (start = index prvního). */
  streak: { start: number; length: number } | null;
  /** Povedené v první a druhé polovině odehraných pokusů. */
  halves: [number, number];
}

/** Cvičení – řada pokusů po hráčích (varianta D). */
export function drillTimeline(events: GameEvent[], players: PlayerId[]): Record<PlayerId, DrillRow> {
  const list = effectiveEvents(events).filter((e) => e.kind === 'hit' || e.kind === 'miss');
  const out: Record<PlayerId, DrillRow> = {};
  for (const p of players) {
    const marks = list.filter((e) => e.playerId === p).map((e) => e.kind === 'hit');
    let best: DrillRow['streak'] = null;
    let run = 0;
    marks.forEach((ok, i) => {
      run = ok ? run + 1 : 0;
      if (run > 0 && (!best || run > best.length)) best = { start: i - run + 1, length: run };
    });
    const half = Math.ceil(marks.length / 2);
    out[p] = { marks, streak: best, halves: [marks.slice(0, half).filter(Boolean).length, marks.slice(half).filter(Boolean).length] };
  }
  return out;
}
