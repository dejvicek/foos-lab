import { canonicalHash, parseHash, toHash, type Route } from './useHashRoute';

const routes: [Route, string][] = [
  [{ page: 'trainings' }, '#/trainings'],
  [{ page: 'training', id: 't1' }, '#/trainings/t1'],
  [{ page: 'training-new' }, '#/trainings/new'],
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
    expect(canonicalHash(hash)).toBeNull();
  });

  it('staré české adresy dál fungují a přepíšou se na anglické', () => {
    const legacy: [string, string][] = [
      ['#/trenink', '#/trainings'],
      ['#/trenink/t1', '#/trainings/t1'],
      ['#/trenink/novy', '#/trainings/new'],
      ['#/trenink/t1/nastaveni', '#/trainings/t1/settings'],
      ['#/zive', '#/live'],
      ['#/moje-hry', '#/my-games'],
      ['#/moje-hra', '#/my-games'],
      ['#/zebricek', '#/ladder'],
      ['#/zebricek/hrac/p1', '#/ladder/player/p1'],
      ['#/discipliny', '#/disciplines'],
      ['#/sablony', '#/templates'],
      ['#/hraci', '#/players'],
      ['#/navod', '#/guide'],
    ];
    for (const [old, now] of legacy) {
      expect(toHash(parseHash(old))).toBe(now);
      expect(canonicalHash(old)).toBe(now);
    }
  });

  it('prázdná adresa se nepřepisuje', () => {
    expect(parseHash('')).toEqual({ page: 'trainings' });
    expect(canonicalHash('')).toBeNull();
    expect(canonicalHash('#/')).toBeNull();
  });
});
