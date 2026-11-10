import { ThemeSwitch } from './ThemeSwitch';
import type { ReactNode } from 'react';
import { toHash, type Route } from '../useHashRoute';

/** Ikony záložek (i v Návodu – stejné jako v appce). */
export const NAV_ICONS: Record<string, ReactNode> = {
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
  disciplines: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 21V5M9 8h6M9 12h6" />
    </svg>
  ),
  templates: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
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
  /** Červená tečka (Moje hry: jsi na řadě). */
  dot?: boolean;
}

/**
 * Hlavní navigace: Živě (běžící trénink, na kterém hráč hraje nebo který organizuje) · Moje hry (jen když hraje) · Trénink · Žebříček
 * · Disciplíny · Šablony a Hráči (jen admin). Na telefonu dole s ikonami.
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
  /** Běží trénink, na kterém jsem → Živě a Moje hry. */
  live?: boolean;
  /** Hraju na běžícím tréninku → Moje hry (organizátor, který nehraje, ji nemá). */
  mine?: boolean;
  myTurn?: boolean;
  admin?: boolean;
}) {
  const items: Item[] = [
    ...(live
      ? [
          { key: 'live', label: 'Živě', route: { page: 'live' } as Route, match: ['live'] as Route['page'][] },
          ...(mine ? [{ key: 'my', label: 'Moje hry', route: { page: 'my' } as Route, match: ['my'] as Route['page'][], dot: myTurn }] : []),
        ]
      : []),
    { key: 'trainings', label: 'Trénink', route: { page: 'trainings' }, match: ['trainings', 'training', 'training-new', 'training-edit'] },
    { key: 'ladder', label: 'Žebříček', route: { page: 'ladder' }, match: ['ladder', 'player'] },
    { key: 'disciplines', label: 'Disciplíny', route: { page: 'disciplines' }, match: ['disciplines'] },
    ...(admin ? [{ key: 'templates', label: 'Šablony', route: { page: 'templates' } as Route, match: ['templates'] as Route['page'][] }] : []),
    ...(admin ? [{ key: 'players', label: 'Hráči', route: { page: 'players' } as Route, match: ['players'] as Route['page'][] }] : []),
  ];
  return (
    <nav className="main-nav" aria-label="Hlavní navigace" style={{ ['--nav-items' as string]: items.length }}>
      <a className="brand" href={toHash({ page: 'trainings' })} aria-label="Foos Lab – úvodní stránka">
        <BrandMark />
        Foos Lab
      </a>
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
            <span className="nav-icon">{NAV_ICONS[it.key]}</span>
            <span className="nav-label">{it.label}</span>
            {it.dot && <i className="nav-dot" aria-hidden="true" />}
          </button>
        );
      })}
      {onSignOut && (
        <span className="nav-user">
          {myName && <span className="nav-name">{myName}</span>}
          <ThemeSwitch />
          <button type="button" className="link" onClick={() => navigate({ page: 'guide' })}>
            Návod
          </button>
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

/** Hlavička přihlášení a změny hesla: logo a přepínač režimu. */
export function AuthHeader() {
  return (
    <header className="auth-head">
      <span className="brand">
        <BrandMark />
        Foos Lab
      </span>
      <ThemeSwitch />
    </header>
  );
}

/** Logo (10. 11. 2026): baňka se zlatou náplní a míčkem; barvy z tokenů (světlý i tmavý režim). */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
      <path className="bm-flask" d="M26 10h12v4h-2v13l14 22a4 4 0 0 1-3.4 6H17.4A4 4 0 0 1 14 49l14-22V14h-2z" />
      <path className="bm-liquid" d="M21 41h22l4.6 7.6a1.6 1.6 0 0 1-1.4 2.4H17.8a1.6 1.6 0 0 1-1.4-2.4z" />
      <circle className="bm-ball" cx="32" cy="43" r="6" />
    </svg>
  );
}
