import {
  activePlayers,
  addPlayer,
  alphabetical,
  canDeletePlayer,
  deletePlayer,
  movePlayer,
  renamePlayer,
  setArchived,
  sortedRoster,
} from './roster';
import type { Player } from './types';
import { training } from '../test/fixtures';

const p = (id: string, order: number, archived = false, name = id): Player => ({ id, name, order, archived });
const ok = (r: ReturnType<typeof addPlayer>) => {
  if ('error' in r) throw new Error(r.error);
  return r.players;
};

describe('addPlayer', () => {
  it('ořízne jméno, sloučí mezery a přidá na konec', () => {
    const res = ok(addPlayer([p('a', 0, false, 'Petr')], 'b', '  Honza   K. '));
    expect(res.find((x) => x.id === 'b')).toEqual({ id: 'b', name: 'Honza K.', archived: false, order: 1 });
  });
  it('prázdné jméno odmítne', () => {
    expect(addPlayer([], 'b', '   ')).toEqual({ error: 'empty' });
  });
  it('duplicitu odmítne bez ohledu na velikost písmen, i u archivovaného', () => {
    expect(addPlayer([p('a', 0, true, 'Honza K.')], 'b', 'honza k.')).toEqual({ error: 'duplicate' });
  });
});

describe('renamePlayer', () => {
  it('přejmenování na vlastní jméno jiným písmem projde', () => {
    expect(ok(renamePlayer([p('a', 0, false, 'Honza')], 'a', 'HONZA'))[0].name).toBe('HONZA');
  });
  it('na jméno jiného hráče neprojde', () => {
    expect(renamePlayer([p('a', 0, false, 'Honza'), p('b', 1, false, 'Petr')], 'b', 'honza')).toEqual({
      error: 'duplicate',
    });
  });
});

describe('pořadí a archiv', () => {
  const players = [p('a', 0), p('b', 1, true), p('c', 2), p('d', 3)];
  it('sortedRoster a activePlayers', () => {
    expect(sortedRoster([p('x', 2), p('y', 1)]).map((x) => x.id)).toEqual(['y', 'x']);
    expect(activePlayers(players).map((x) => x.id)).toEqual(['a', 'c', 'd']);
  });
  it('movePlayer prohodí se sousedem mezi aktivními (přeskočí archivované)', () => {
    expect(activePlayers(movePlayer(players, 'c', -1)).map((x) => x.id)).toEqual(['c', 'a', 'd']);
    expect(activePlayers(movePlayer(players, 'a', -1)).map((x) => x.id)).toEqual(['a', 'c', 'd']);
    expect(activePlayers(movePlayer(players, 'd', 1)).map((x) => x.id)).toEqual(['a', 'c', 'd']);
  });
  it('setArchived', () => {
    expect(activePlayers(setArchived(players, 'b', false)).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('smazat jde jen hráče, který nebyl na žádném tréninku', () => {
    const ts = [training('t', '2026-10-01', 'team', ['a', 'c', 'd', 'e'])];
    expect(canDeletePlayer(ts, 'a')).toBe(false);
    expect(canDeletePlayer(ts, 'b')).toBe(true);
    expect(deletePlayer(players, 'b').map((x) => x.id)).toEqual(['a', 'c', 'd']);
  });
});

describe('abecední řazení (Hráči, Přítomní)', () => {
  it('podle české abecedy, bez ohledu na velikost písmen; pořadí v soupisce se nemění', () => {
    const names = ['Hugo', 'Čeněk', 'chrudoš', 'Cyril', 'Ada', 'Šimon', 'Zdeněk', 'Řehoř', 'Radek'];
    const ps = names.map((name, i) => ({ id: `x${i}`, name, order: i, archived: false }));
    expect(alphabetical(ps).map((x) => x.name)).toEqual(['Ada', 'Cyril', 'Čeněk', 'Hugo', 'chrudoš', 'Radek', 'Řehoř', 'Šimon', 'Zdeněk']);
    expect(ps.map((x) => x.name)).toEqual(names);
  });
});
