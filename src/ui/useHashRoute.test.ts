import { parseHash, toHash, type Route } from './useHashRoute';

const routes: [Route, string][] = [
  [{ page: 'trainings' }, '#/trainings'],
  [{ page: 'training', id: 't1' }, '#/trainings/t1'],
  [{ page: 'training-new' }, '#/trainings/new'],
  [{ page: 'practice-new' }, '#/practice/new'],
  [{ page: 'practice', id: 'p1' }, '#/practice/p1'],
  [{ page: 'training-edit', id: 't1' }, '#/trainings/t1/settings'],
  [{ page: 'live' }, '#/live'],
  [{ page: 'my' }, '#/my-games'],
  [{ page: 'ladder' }, '#/ladder'],
  [{ page: 'player', id: 'p 1' }, '#/ladder/player/p%201'],
  [{ page: 'disciplines' }, '#/disciplines'],
  [{ page: 'templates' }, '#/templates'],
  [{ page: 'players' }, '#/players'],
  [{ page: 'guide' }, '#/guide'],
];

describe('adresy stránek (anglicky od 10. 11. 2026)', () => {
  it.each(routes)('%o ↔ %s', (route, hash) => {
    expect(toHash(route)).toBe(hash);
    expect(parseHash(hash)).toEqual(route);
  });

  it('staré české a neznámé adresy: stránka nenalezena', () => {
    for (const h of ['#/trenink', '#/trenink/t1', '#/trenink/novy', '#/zive', '#/moje-hry', '#/zebricek', '#/zebricek/hrac/p1', '#/discipliny', '#/sablony', '#/hraci', '#/navod', '#/nic'])
      expect(parseHash(h)).toEqual({ page: 'not-found' });
    expect(parseHash('#/ladder/hrac/p1')).toEqual({ page: 'not-found' });
    expect(parseHash('#/trainings/t1/nastaveni')).toEqual({ page: 'not-found' });
  });

  it('prázdná adresa je úvod (Trénink)', () => {
    expect(parseHash('')).toEqual({ page: 'trainings' });
    expect(parseHash('#/')).toEqual({ page: 'trainings' });
  });
});
