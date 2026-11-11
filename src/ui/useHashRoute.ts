import { useCallback, useEffect, useState } from 'react';

export type Route =
  | { page: 'trainings' }
  | { page: 'training'; id: string }
  | { page: 'training-new' }
  | { page: 'training-edit'; id: string }
  /** Vlastní trénink (PRD 5.11): začít a běžící / souhrn. */
  | { page: 'practice-new' }
  | { page: 'practice'; id: string }
  | { page: 'live' }
  | { page: 'my' }
  | { page: 'ladder' }
  | { page: 'player'; id: string }
  | { page: 'disciplines' }
  | { page: 'templates' }
  | { page: 'players' }
  /** Návod pro hráče (landing page, 10. 11. 2026) – i bez přihlášení. */
  | { page: 'guide' }
  /** Neznámá adresa (i staré české #/trenink …): „Stránka nenalezena“ s tlačítkem na úvod. */
  | { page: 'not-found' };

/** Adresy jsou anglicky (10. 11. 2026); staré české ani jiné neznámé se nepodporují → „Stránka nenalezena“. */
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = parts;
  const n = parts.length;
  if (n === 0) return { page: 'trainings' };
  if (a === 'trainings') {
    if (n === 1) return { page: 'trainings' };
    if (n === 2) return b === 'new' ? { page: 'training-new' } : { page: 'training', id: b };
    if (n === 3 && c === 'settings') return { page: 'training-edit', id: b };
  }
  if (a === 'practice' && n === 2) return b === 'new' ? { page: 'practice-new' } : { page: 'practice', id: b };
  if (a === 'ladder') {
    if (n === 1) return { page: 'ladder' };
    if (n === 3 && b === 'player') return { page: 'player', id: c };
  }
  if (n === 1) {
    if (a === 'live') return { page: 'live' };
    if (a === 'my-games') return { page: 'my' };
    if (a === 'disciplines') return { page: 'disciplines' };
    if (a === 'templates') return { page: 'templates' };
    if (a === 'players') return { page: 'players' };
    if (a === 'guide') return { page: 'guide' };
  }
  return { page: 'not-found' };
}

export function toHash(r: Route): string {
  switch (r.page) {
    case 'trainings':
      return '#/trainings';
    case 'training':
      return `#/trainings/${encodeURIComponent(r.id)}`;
    case 'training-new':
      return '#/trainings/new';
    case 'training-edit':
      return `#/trainings/${encodeURIComponent(r.id)}/settings`;
    case 'practice-new':
      return '#/practice/new';
    case 'practice':
      return `#/practice/${encodeURIComponent(r.id)}`;
    case 'live':
      return '#/live';
    case 'my':
      return '#/my-games';
    case 'ladder':
      return '#/ladder';
    case 'player':
      return `#/ladder/player/${encodeURIComponent(r.id)}`;
    case 'disciplines':
      return '#/disciplines';
    case 'templates':
      return '#/templates';
    case 'players':
      return '#/players';
    case 'guide':
      return '#/guide';
    case 'not-found':
      return '#/not-found';
  }
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = useCallback((r: Route) => {
    const h = toHash(r);
    if (window.location.hash !== h) window.location.hash = h;
    setRoute(r);
    window.scrollTo?.(0, 0);
  }, []);
  return [route, navigate];
}
