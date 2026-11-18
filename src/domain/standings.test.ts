import { computeStandings, parseScoreValue } from './standings';
import { buildSchedule } from './schedule';
import type { Score } from './types';
import { H } from '../test/fixtures';

const team8 = buildSchedule({ mode: 'team', tables: 4, attendees: H(8) });
const L1 = 'league|1|1|H1+H2vH3+H4'; // kolo 1, stůl 1
const L1b = 'league|1|2|H5+H6vH7+H8';
const row = (rows: ReturnType<typeof computeStandings>['rows'], id: string) => rows.find((r) => r.playerId === id)!;

describe('parseScoreValue', () => {
  it('bere jen celá nezáporná čísla', () => {
    expect(parseScoreValue('3')).toBe(3);
    expect(parseScoreValue(0)).toBe(0);
    expect(parseScoreValue('')).toBeNull();
    expect(parseScoreValue('-1')).toBeNull();
    expect(parseScoreValue('x')).toBeNull();
    expect(parseScoreValue(2.5)).toBeNull();
    expect(parseScoreValue(null)).toBeNull();
    expect(parseScoreValue(undefined)).toBeNull();
  });
});

describe('computeStandings', () => {
  it('ligový zápas 6:2 se ztrátami 1/3 přičte oběma hráčům strany (Daň za ztrátu, kolo 2)', () => {
    const tax = team8.matches.find((m) => m.round === 2 && m.block === 'league')!;
    expect(tax.lossTax).toBe(true);
    const [w, x, y] = [tax.sideA[0], tax.sideA[1], tax.sideB[0]];
    const { rows, legsDone } = computeStandings(team8, { [tax.id]: { ga: 6, gb: 2, la: 1, lb: 3 } }, H(8));
    expect(legsDone).toBe(1);
    expect(row(rows, w)).toMatchObject({ legs: 1, wins: 1, gf: 6, gc: 2, diff: 4, loss: 1, lossLegs: 1 });
    expect(row(rows, x)).toMatchObject({ legs: 1, wins: 1, diff: 4 });
    expect(row(rows, y)).toMatchObject({ legs: 1, wins: 0, diff: -4, loss: 3, lossLegs: 1 });
  });

  it('ztráty mimo Daň (starší zápis) se nepočítají (18. 11. 2026)', () => {
    const { rows } = computeStandings(team8, { [L1]: { ga: 6, gb: 2, la: 1, lb: 3 } }, H(8));
    expect(row(rows, 'H1')).toMatchObject({ legs: 1, wins: 1, gf: 6, gc: 2, diff: 4, loss: 0, lossLegs: 0 });
    expect(row(rows, 'H3')).toMatchObject({ legs: 1, loss: 0, lossLegs: 0 });
    expect(row(rows, 'H5')).toMatchObject({ legs: 0 });
  });

  it('zápas jen s jedním gólem se nepočítá', () => {
    const { rows, legsDone } = computeStandings(team8, { [L1]: { ga: 6 } }, H(8));
    expect(legsDone).toBe(0);
    expect(row(rows, 'H1').legs).toBe(0);
  });

  it('bez zapsaných ztrát se lossLegs nezvýší', () => {
    const { rows } = computeStandings(team8, { [L1]: { ga: 6, gb: 2, la: null } }, H(8));
    expect(row(rows, 'H1')).toMatchObject({ legs: 1, loss: 0, lossLegs: 0 });
  });

  it('simulace: výhry v setech, tým A/B', () => {
    const sim = team8.matches.find((m) => m.block === 'sim')!;
    const { rows, sim: res } = computeStandings(team8, { [sim.id]: { ga: 2, gb: 1 } }, H(8));
    expect(res).toEqual({ teamA: 1, teamB: 0, played: 1 });
    for (const p of sim.sideA) expect(row(rows, p)).toMatchObject({ simM: 1, simW: 1, legs: 0 });
    for (const p of sim.sideB) expect(row(rows, p)).toMatchObject({ simM: 1, simW: 0 });
  });

  it('řazení: rozdíl → výhry → góly+ → simW, při shodě pořadí přítomných', () => {
    const scores: Record<string, Score> = {
      [L1]: { ga: 6, gb: 4 }, // H1,H2 +2 (1 výhra, gf 6); H3,H4 −2
      [L1b]: { ga: 3, gb: 1 }, // H5,H6 +2 (1 výhra, gf 3); H7,H8 −2
    };
    const order = computeStandings(team8, scores, H(8)).rows.map((r) => r.playerId);
    expect(order).toEqual(['H1', 'H2', 'H5', 'H6', 'H3', 'H4', 'H7', 'H8']);
  });

  it('jedničky nemají simulaci', () => {
    const s = buildSchedule({ mode: 'single', tables: 2, attendees: H(5) });
    expect(computeStandings(s, {}, H(5)).sim).toBeNull();
  });
});
