import { buildSchedule, canBuildSchedule, matchId } from './schedule';
import { clock, EXPLANATIONS, ROUNDS, STATIONS } from './content';
import type { Mode, Schedule, TableCount } from './types';
import { H, range } from '../test/fixtures';

const T = (n: number, tables: number, mode: Mode = 'team') =>
  buildSchedule({ mode, tables: tables as TableCount, attendees: H(n) });
const section = (s: Schedule, id: string) => s.sections.find((x) => x.id === id)!;
const matchRows = (s: Schedule, id: string) => section(s, id).rows.filter((r) => r.kind === 'matches');

describe('content', () => {
  it('clock formátuje minuty jako h:mm', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(75)).toBe('1:15');
    expect(clock(106)).toBe('1:46');
  });
  it('má 4 stanoviště, 7 kol a vysvětlivky', () => {
    expect(STATIONS).toHaveLength(4);
    expect(ROUNDS.map((r) => r.min)).toEqual([8, 8, 8, 8, 5, 3, 3]);
    expect(EXPLANATIONS.flatMap((g) => g.items.map((i) => i.name))).toContain('Daň za ztrátu');
  });
});

describe('buildSchedule – týmový', () => {
  it('n=8, t=4: kolo 1 = 2 dvojice, nikdo nečeká, stoly 3–4 volné', () => {
    const r = matchRows(T(8, 4), 'league')[0];
    expect(r.cells.filter(Boolean)).toHaveLength(2);
    expect(r.cells.slice(2)).toEqual([null, null]);
    expect(r.waiting).toEqual([]);
  });

  it('n=13, t=4: v kole 2 čeká H1', () => {
    expect(matchRows(T(13, 4), 'league')[0].waiting).toEqual(['H13']);
    expect(matchRows(T(13, 4), 'league')[1].waiting).toEqual(['H1']);
  });

  it('časy kol scénářové ligy a pauza', () => {
    const s = T(13, 4);
    expect(matchRows(s, 'league').map((r) => r.time)).toEqual([60, 69, 78, 87, 96, 102, 106]);
    expect(section(s, 'league').rows.at(-1)).toMatchObject({ kind: 'break', label: 'Pauza', time: 110 });
    expect(matchRows(s, 'league')[4].rule).toBe('Start 0:3 + daň (levá strana začíná 0:3), 5 min');
  });

  it('sólová část: rozehrání 0:00, rotace po 8 min, pauza (g=4)', () => {
    expect(section(T(8, 4), 'solo').rows.map((r) => r.time)).toEqual([0, 15, 23, 31, 39, 47]);
    const rot2 = section(T(8, 4), 'solo').rows[2];
    // rotace 2: stůl 1 hostí skupinu ((0-1) mod 4) = 3, stanoviště 1
    expect(rot2.cells[0]).toEqual({ type: 'group', players: ['H4', 'H8'], station: STATIONS[0], metric: 'fiveBarControl' });
  });

  it('simulace: vlny 2:00 a 2:20, vyhodnocení 2:45, týmy A/B', () => {
    const s = T(12, 4);
    expect(section(s, 'sim').rows.map((r) => [r.time, r.label])).toEqual([
      [120, '1. vlna'],
      [140, '2. vlna'],
      [165, 'Vyhodnocení a zápis'],
    ]);
    expect(s.teams).toEqual({ A: H(6), B: H(12).slice(6) });
    expect(s.summary).toMatchObject({ doublesPerRound: 3, singlesPerRound: 0, waitingPerRound: 0, simDoubles: 5, simSingles: 2 });
  });

  it('n=7, t=4: 1 dvojice + 1 singl + 1 rozhodčí', () => {
    expect(T(7, 4).summary).toMatchObject({ doublesPerRound: 1, singlesPerRound: 1, waitingPerRound: 1 });
  });

  it('ID zápasu', () => {
    expect(T(12, 4).matches[0].id).toBe('league|1|1|H1+H2vH3+H4');
    expect(matchId('sim', 2, 3, ['a'], ['b'])).toBe('sim|2|3|avb');
  });
});

describe('buildSchedule – jedničky', () => {
  it('n=5, t=2: 2 singly + 1 počítá, kola 0:30…1:06, zápis 1:12', () => {
    const s = T(5, 2, 'single');
    expect(s.sections).toHaveLength(1);
    expect(matchRows(s, 'singles').map((r) => r.time)).toEqual([30, 39, 48, 57, 66]);
    expect(section(s, 'singles').rows.at(-1)).toMatchObject({ label: 'Zápis', time: 72, rule: '10 min' });
    expect(s.summary).toMatchObject({ singlesPerRound: 2, waitingPerRound: 1 });
    expect(matchRows(s, 'singles')[1].waiting).toEqual(['H1']);
    expect(s.teams).toBeNull();
  });
});

describe('buildSchedule – meze a invarianty', () => {
  it('mimo 4–13 hráčů vyhodí chybu', () => {
    expect(() => T(3, 2)).toThrow();
    expect(() => T(14, 4)).toThrow();
    expect(canBuildSchedule({ mode: 'team', tables: 4, attendees: H(3) })).toBe(false);
    expect(canBuildSchedule({ mode: 'team', tables: 4, attendees: H(13) })).toBe(true);
  });

  it('n=4..13, t=1..4, oba typy: deterministický, unikátní ID, každý hráč v řádku přesně jednou', () => {
    for (const n of range(4, 13))
      for (const t of range(1, 4))
        for (const mode of ['team', 'single'] as Mode[]) {
          const s = T(n, t, mode);
          expect(T(n, t, mode)).toEqual(s);
          const ids = s.matches.map((m) => m.id);
          expect(new Set(ids).size).toBe(ids.length);
          for (const sec of s.sections)
            for (const row of sec.rows) {
              expect(row.cells).toHaveLength(t);
              if (row.kind !== 'matches' || sec.id === 'sim') continue;
              const ps = [
                ...row.cells.flatMap((c) => (c?.type === 'match' ? [...c.match.sideA, ...c.match.sideB] : [])),
                ...row.waiting,
              ];
              expect([...ps].sort()).toEqual([...H(n)].sort());
            }
        }
  });
});
