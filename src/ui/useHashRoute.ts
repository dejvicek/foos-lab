import { useCallback, useEffect, useState } from 'react';

export type Route =
  | { page: 'trainings' }
  | { page: 'training'; id: string }
  | { page: 'training-new' }
  | { page: 'training-edit'; id: string }
  | { page: 'live' }
  | { page: 'my' }
  | { page: 'ladder' }
  | { page: 'player'; id: string }
  | { page: 'disciplines' }
  | { page: 'templates' }
  | { page: 'players' }
  /** Návod pro hráče (landing page, 10. 11. 2026) – i bez přihlášení. */
  | { page: 'guide' };

/**
 * Adresy jsou anglicky (10. 11. 2026, rozhodnutí uživatele). Staré české (#/trenink, #/zebricek …) mají lidé
 * v záložkách a odkazech – dál fungují a appka je přepíše na anglické (canonicalHash).
 */
const PAGE: Record<string, string> = {
  trenink: 'trainings',
  zive: 'live',
  'moje-hry': 'my-games',
  'moje-hra': 'my-games',
  zebricek: 'ladder',
  discipliny: 'disciplines',
  sablony: 'templates',
  hraci: 'players',
  navod: 'guide',
};

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const page = PAGE[parts[0]] ?? parts[0];
  if (page === 'trainings' && (parts[1] === 'new' || parts[1] === 'novy')) return { page: 'training-new' };
  if (page === 'trainings' && parts[1] && (parts[2] === 'settings' || parts[2] === 'nastaveni')) return { page: 'training-edit', id: parts[1] };
  if (page === 'trainings' && parts[1]) return { page: 'training', id: parts[1] };
  if (page === 'live') return { page: 'live' };
  if (page === 'my-games') return { page: 'my' };
  if (page === 'ladder' && (parts[1] === 'player' || parts[1] === 'hrac') && parts[2]) return { page: 'player', id: parts[2] };
  if (page === 'ladder') return { page: 'ladder' };
  if (page === 'disciplines') return { page: 'disciplines' };
  if (page === 'templates') return { page: 'templates' };
  if (page === 'players') return { page: 'players' };
  if (page === 'guide') return { page: 'guide' };
  return { page: 'trainings' };
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
  }
}

/** Anglická podoba adresy, když se liší (stará česká, neznámá stránka); prázdná adresa zůstává. */
export function canonicalHash(hash: string): string | null {
  if (!hash.replace(/^#\/?/, '')) return null;
  const c = toHash(parseHash(hash));
  return c === hash ? null : c;
}

/** Přepíše adresu na anglickou bez nového záznamu v historii (Zpět nevede na starou adresu). */
function canonicalize() {
  const c = canonicalHash(window.location.hash);
  if (c) window.history.replaceState(window.history.state, '', c);
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => {
    canonicalize();
    return parseHash(window.location.hash);
  });
  useEffect(() => {
    const on = () => {
      canonicalize();
      setRoute(parseHash(window.location.hash));
    };
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
