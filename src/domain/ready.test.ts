import { delayStats, markReady, readyKeyOf, readyKeys, runQueue, TRAINING_ITEM, type QueueEntry } from './queue';
import { canMarkReady, type Viewer } from './my';
import type { Match, Training } from './types';
import { H } from '../test/fixtures';

/**
 * Připravenost místo Zahájit (18. 11. 2026, *rozhodnutí uživatele*): každá strana zápasu dá „Připraven“,
 * u cvičení každý hráč za sebe; utkání začne, až jsou připravení všichni. Zdržovači počítají každému
 * čekání do připravenosti jeho strany.
 */
const S = 1000;
const T0 = 1_000_000_000;
const at = (sec: number) => T0 + sec * S;
const match: Match = { id: 'league|1|1|H1+H2vH3+H4', block: 'league', round: 1, table: 1, kind: 'doubles', sideA: ['H1', 'H2'], sideB: ['H3', 'H4'], referee: 'H5' };
const mItem: QueueEntry = { kind: 'item', id: match.id, players: ['H1', 'H2', 'H3', 'H4'], table: 1, label: '1. kolo', group: false, match };
const dItem: QueueEntry = { kind: 'item', id: 'drill|Kolo 2|1|H1+H2', players: ['H1', 'H2'], table: 1, label: '2. kolo', group: true };

describe('připravenost', () => {
  it('klíče: zápas strany A / B, cvičení hráči; hráč patří ke své straně', () => {
    expect(readyKeys(mItem)).toEqual(['A', 'B']);
    expect(readyKeys(dItem)).toEqual(['H1', 'H2']);
    expect(readyKeyOf(mItem, 'H2')).toBe('A');
    expect(readyKeyOf(mItem, 'H4')).toBe('B');
    expect(readyKeyOf(dItem, 'H2')).toBe('H2');
  });

  it('utkání začne, až jsou připravení všichni – v čase posledního', () => {
    let pt = markReady(undefined, 'A', true, ['A', 'B'], at(10));
    expect(pt).toEqual({ ready: { A: at(10) } });
    pt = markReady(pt, 'A', true, ['A', 'B'], at(20)); // opakování nemění čas
    expect(pt).toEqual({ ready: { A: at(10) } });
    pt = markReady(pt, 'B', true, ['A', 'B'], at(70));
    expect(pt).toEqual({ ready: { A: at(10), B: at(70) }, startedAt: at(70) });
    // po zahájení se nic nemění, ani zrušení
    expect(markReady(pt, 'A', false, ['A', 'B'], at(80))).toBe(pt);
  });

  it('zrušení připravenosti před zahájením', () => {
    const pt = markReady(markReady(undefined, 'A', true, ['A', 'B'], at(10)), 'A', false, ['A', 'B'], at(15));
    expect(pt).toEqual({});
  });

  it('cvičení: začne, až jsou připravení všichni hráči skupiny', () => {
    const pt = markReady(markReady(undefined, 'H1', true, ['H1', 'H2'], at(5)), 'H2', true, ['H1', 'H2'], at(30));
    expect(pt.startedAt).toBe(at(30));
  });
});

describe('Zdržovači s připraveností', () => {
  it('každý čeká do připravenosti své strany; hra od zahájení (oba připravení)', () => {
    const pt = markReady(markReady(undefined, 'A', true, ['A', 'B'], at(10)), 'B', true, ['A', 'B'], at(70));
    const times = { [TRAINING_ITEM]: { startedAt: at(0) }, [match.id]: { ...pt, endedAt: at(370) } };
    const states = runQueue([mItem], times, [1], at(400));
    expect(states.get(match.id)).toMatchObject({ activeAt: at(0), startedAt: at(70), ready: { A: at(10), B: at(70) } });
    const rows = Object.fromEntries(delayStats([mItem], states).map((r) => [r.playerId, r]));
    expect(rows.H1).toMatchObject({ waitSum: 10 * S, playSum: 300 * S });
    expect(rows.H2.waitSum).toBe(10 * S);
    expect(rows.H3.waitSum).toBe(70 * S);
    expect(rows.H4.waitSum).toBe(70 * S);
    expect(delayStats([mItem], states)[0].playerId).toBe('H3'); // nejdéle čekal tým B
  });

  it('starší utkání bez připravenosti: čekání do zahájení jako dřív', () => {
    const times = { [TRAINING_ITEM]: { startedAt: at(0) }, [match.id]: { startedAt: at(40), endedAt: at(100) } };
    const rows = delayStats([mItem], runQueue([mItem], times, [1], at(200)));
    expect(rows.every((r) => r.waitSum === 40 * S)).toBe(true);
  });
});

describe('kdo smí hlásit připravenost', () => {
  const t = { id: 't', attendees: H(6), format: 'custom', createdBy: 'H6' } as Training;
  const v = (playerId: string | null, isAdmin = false): Viewer => ({ playerId, isAdmin, isOrganizer: playerId === 'H6' });
  it('zápas: hráč své strany, rozhodčí a organizátor kteroukoli', () => {
    expect(canMarkReady(v('H1'), t, mItem, 'A')).toBe(true);
    expect(canMarkReady(v('H1'), t, mItem, 'B')).toBe(false);
    expect(canMarkReady(v('H5'), t, mItem, 'B')).toBe(true); // rozhodčí
    expect(canMarkReady(v('H6'), t, mItem, 'A')).toBe(true); // zakladatel (organizátor)
    expect(canMarkReady(v('H6'), t, dItem, 'H1')).toBe(true);
    expect(canMarkReady(v('X', true), t, mItem, 'B')).toBe(true); // admin
  });
  it('cvičení: hráč za sebe i za spoluhráče u stolu (20. 11. 2026), hráč mimo skupinu ne', () => {
    expect(canMarkReady(v('H1'), t, dItem, 'H1')).toBe(true);
    expect(canMarkReady(v('H1'), t, dItem, 'H2')).toBe(true);
    expect(canMarkReady(v('H1'), t, dItem, 'H3')).toBe(false); // H3 u stolu není
    expect(canMarkReady(v('H5'), t, dItem, 'H1')).toBe(false);
  });
});
