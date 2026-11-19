import { buildSchedule } from './schedule';
import { nextBreak, rowKind, rowType, trainingProgress } from './progress';
import type { Training } from './types';
import { H } from '../test/fixtures';

const custom = (plan: Training['plan'], over: Partial<Training> = {}): Training => ({
  id: 'c', date: '2026-11-18', startTime: '18:00', mode: 'team', tables: 4, attendees: H(8), scores: {}, soloResults: {},
  simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan, lockedRounds: [], ...over,
});

describe('průběh tréninku (čára v nadpisu kola, 18. 11. 2026)', () => {
  it('typ kola podle disciplíny: cvičení, zápas, scénář, Zeď, Daň, simulace', () => {
    const s = buildSchedule(custom({ warmupPasses: 1, normal: 1, start45: 2, wall: 2, lossTax: 1, sim: 1 }));
    const types = trainingProgress(s, 120).filter((x) => x.kind === 'round').map((x) => x.type);
    expect(new Set(types)).toEqual(new Set(['drill', 'normal', 'scen', 'wall', 'tax', 'sim']));
    for (const x of trainingProgress(s, 120).filter((y) => y.kind === 'round')) expect(x.type).toBe(rowType(x.row));
  });

  it('druh kola pro barvu osy jako v kroku Disciplíny: cvičení, zápasy a scénáře, simulace', () => {
    const s = buildSchedule(custom({ warmupPasses: 1, normal: 1, start45: 2, wall: 2, lossTax: 1, sim: 1 }));
    const rounds = trainingProgress(s, 120).filter((x) => x.kind === 'round');
    const kinds = new Map(rounds.map((x) => [x.type, rowKind(x.row)]));
    expect(Object.fromEntries(kinds)).toEqual({ drill: 'drill', normal: 'match', scen: 'match', wall: 'match', tax: 'match', sim: 'sim' });
  });

  it('kola očíslovaná po sobě bez pauz, délka = do dalšího řádku, poslední do konce tréninku', () => {
    const s = buildSchedule(custom({ normal: 3, lossTax: 3 }, { breaks: [{ after: 3, min: 10 }] }));
    const segs = trainingProgress(s, 120);
    const rounds = segs.filter((x) => x.kind === 'round');
    expect(rounds.map((x) => x.index)).toEqual([0, 1, 2, 3, 4, 5]);
    segs.slice(0, -1).forEach((x, i) => expect(x.min).toBe(segs[i + 1].time - x.time));
    expect(segs.at(-1)!.min).toBe(120 - segs.at(-1)!.time);
  });

  it('další pauza: za kolik kol, jak dlouhá; po ní žádná', () => {
    const s = buildSchedule(custom({ normal: 3, lossTax: 3 }, { breaks: [{ after: 3, min: 10 }] }));
    const segs = trainingProgress(s, 120);
    if (!segs.some((x) => x.kind === 'break')) throw new Error('rozpis bez pauzy');
    const b = nextBreak(segs, 0)!;
    expect(b.afterRounds).toBe(2);
    expect(b.min).toBe(10);
    expect(nextBreak(segs, 2)!.afterRounds).toBe(0);
    expect(nextBreak(segs, 3)).toBeNull();
  });
});
