import type { ReactNode } from 'react';
import type { Route } from '../useHashRoute';

const ICON: Record<string, ReactNode> = {
  live: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M5 12a7 7 0 0 1 14 0M2 12a10 10 0 0 1 20 0" />
    </svg>
  ),
  my: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M12 6v12" />
    </svg>
  ),
  trainings: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16M9 4v16" />
    </svg>
  ),
  ladder: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 20V10M12 20V4M18 20v-7" />
    </svg>
  ),
  players: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2" />
      <path d="M3 19c0-3 3-5 6-5s6 2 6 5M15 15c3 0 5 1 6 4" />
    </svg>
  ),
};

interface Item {
  key: string;
  label: string;
  route: Route;
  match: Route['page'][];
  /** Červená tečka (Moje hra: jsi na řadě). */
  dot?: boolean;
}

/**
 * Hlavní navigace: Živě (běžící trénink, na kterém hráč hraje nebo který organizuje) · Moje hra (jen když hraje) · Trénink · Žebříček
 * · Hráči (jen admin). Na telefonu dole s ikonami.
 */
export function MainNav({
  route,
  navigate,
  myName,
  onChangePassword,
  onSignOut,
  live = false,
  mine = live,
  myTurn = false,
  admin = true,
}: {
  route: Route;
  navigate: (r: Route) => void;
  myName?: string | null;
  onChangePassword?(): void;
  onSignOut?(): void;
  /** Běží trénink, na kterém jsem → Živě a Moje hra. */
  live?: boolean;
  /** Hraju na běžícím tréninku → Moje hra (organizátor, který nehraje, ji nemá). */
  mine?: boolean;
  myTurn?: boolean;
  admin?: boolean;
}) {
  const items: Item[] = [
    ...(live
      ? [
          { key: 'live', label: 'Živě', route: { page: 'live' } as Route, match: ['live'] as Route['page'][] },
          ...(mine ? [{ key: 'my', label: 'Moje hra', route: { page: 'my' } as Route, match: ['my'] as Route['page'][], dot: myTurn }] : []),
        ]
      : []),
    { key: 'trainings', label: 'Trénink', route: { page: 'trainings' }, match: ['trainings', 'training', 'training-new', 'training-edit'] },
    { key: 'ladder', label: 'Žebříček', route: { page: 'ladder' }, match: ['ladder', 'player'] },
    ...(admin ? [{ key: 'players', label: 'Hráči', route: { page: 'players' } as Route, match: ['players'] as Route['page'][] }] : []),
  ];
  return (
    <nav className="main-nav" aria-label="Hlavní navigace" style={{ ['--nav-items' as string]: items.length }}>
      <span className="brand">Rozpis stolů</span>
      {items.map((it) => {
        const active = it.match.includes(route.page);
        return (
          <button
            key={it.key}
            type="button"
            className={active ? 'active' : undefined}
            aria-current={active ? 'page' : undefined}
            aria-label={it.dot ? `${it.label} – jsi na řadě` : undefined}
            onClick={() => navigate(it.route)}
          >
            <span className="nav-icon">{ICON[it.key]}</span>
            <span className="nav-label">{it.label}</span>
            {it.dot && <i className="nav-dot" aria-hidden="true" />}
          </button>
        );
      })}
      {onSignOut && (
        <span className="nav-user">
          {myName && <span className="nav-name">{myName}</span>}
          <button type="button" className="link" onClick={onChangePassword}>
            Heslo
          </button>
          <button type="button" className="link" onClick={onSignOut}>
            Odhlásit
          </button>
        </span>
      )}
    </nav>
  );
}
