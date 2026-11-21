import { APP_VERSION } from '../../storage/appVersion';
import { ThemeSwitch } from './ThemeSwitch';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../theme';
import { toHash, type Route } from '../useHashRoute';
import { Avatar, initialOf } from './Avatar';

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
 * Hlavní navigace: Moje hry (běžící trénink, na kterém hráč hraje) · Tréninky (probíhající trénink, jinak seznam) · Žebříček
 * · Disciplíny · Hráči (jen admin). Na telefonu dole s ikonami. Vpravo menu účtu (21. 11. 2026, *rozhodnutí uživatele*,
 * varianta A): Můj profil, Návod, Tmavý režim, Šablony (admin), Změnit heslo, Odhlásit – Šablony už nejsou v hlavní navigaci.
 */
export function MainNav({
  route,
  navigate,
  myName,
  myId = null,
  onChangePassword,
  onSignOut,
  live = false,
  mine = live,
  myTurn = false,
  admin = true,
  running = null,
}: {
  /** Probíhající trénink: „Tréninky“ ho rovnou otevře (19. 11. 2026); záložka Živě zrušena. */
  running?: string | null;
  route: Route;
  navigate: (r: Route) => void;
  myName?: string | null;
  /** Přihlášený hráč: jméno v liště vede na jeho profil (20. 11. 2026). */
  myId?: string | null;
  onChangePassword?(): void;
  onSignOut?(): void;
  /** Běží trénink, na kterém jsem → Moje hry. */
  live?: boolean;
  /** Hraju na běžícím tréninku → Moje hry (organizátor, který nehraje, ji nemá). */
  mine?: boolean;
  myTurn?: boolean;
  admin?: boolean;
}) {
  const items: Item[] = [
    ...(live && mine ? [{ key: 'my', label: 'Moje hry', route: { page: 'my' } as Route, match: ['my'] as Route['page'][], dot: myTurn }] : []),
    { key: 'trainings', label: 'Tréninky', route: running ? { page: 'training', id: running } : { page: 'trainings' }, match: ['live', 'trainings', 'training', 'training-new', 'training-edit', 'practice-new', 'practice'] },
    { key: 'ladder', label: 'Žebříčky', route: { page: 'ladder' }, match: ['ladder', 'player'] },
    { key: 'disciplines', label: 'Disciplíny', route: { page: 'disciplines' }, match: ['disciplines'] },
    ...(admin ? [{ key: 'players', label: 'Hráči', route: { page: 'players' } as Route, match: ['players'] as Route['page'][] }] : []),
  ];
  return (
    <nav className="main-nav" aria-label="Hlavní navigace" style={{ ['--nav-items' as string]: items.length }}>
      {/* Číslo verze je tlačítko (patch notes) – vedle odkazu na úvod, ne v něm (20. 11. 2026). */}
      <span className="brand-group">
        <a className="brand" href={toHash({ page: 'trainings' })} aria-label="Foos Lab – úvodní stránka">
          <BrandMark />
          Foos Lab
        </a>
        <VersionTag />
      </span>
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
          {/* Na telefonu je logo dole skryté – tady (jen tam) s verzí; klik vede na úvod jako na notebooku (19. 11. 2026). */}
          <span className="nav-brand-mobile">
            <a href={toHash({ page: 'trainings' })} aria-label="Úvodní stránka">
              <BrandMark />
            </a>
            <VersionTag />
          </span>
          <AccountMenu name={myName ?? 'Účet'} myId={myId} admin={admin} templatesActive={route.page === 'templates'} navigate={navigate} onChangePassword={onChangePassword} onSignOut={onSignOut} />
        </span>
      )}
    </nav>
  );
}

/**
 * Menu účtu vpravo v liště (21. 11. 2026, *rozhodnutí uživatele*, varianta A): tlačítko s iniciálou a jménem, menu
 * Můj profil · Návod · Tmavý režim · Šablony (admin) · Změnit heslo · Odhlásit. Na telefonu vyjede zespodu.
 * Zavře se výběrem, Escem nebo klepnutím mimo; přepnutí režimu menu nechá otevřené, ať je změna vidět.
 */
function AccountMenu({
  name,
  myId,
  admin,
  templatesActive,
  navigate,
  onChangePassword,
  onSignOut,
}: {
  name: string;
  myId: string | null;
  admin: boolean;
  templatesActive: boolean;
  navigate(r: Route): void;
  onChangePassword?(): void;
  onSignOut?(): void;
}) {
  const [open, setOpen] = useState(false);
  // Poloha menu na notebooku (pod tlačítkem, zarovnané vpravo); menu je v portálu, mimo lištu, ať nepřebírá její styly.
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const [theme, toggleTheme] = useTheme();
  const box = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  const toggle = () => {
    const r = box.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setOpen(!open);
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  const pick = (fn?: () => void) => () => {
    setOpen(false);
    fn?.();
  };
  return (
    <span className="acct-box" ref={box}>
      <button
        type="button"
        className={templatesActive ? 'acct active' : 'acct'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Účet: ${name}`}
        onClick={toggle}
      >
        {myId ? (
          <Avatar id={myId} size="m" />
        ) : (
          <span className="av av-m ini" aria-hidden="true" data-ini={initialOf(name)} />
        )}
        <span className="acct-name">{name}</span>
        <span className="acct-chev" aria-hidden="true">
          ▾
        </span>
      </button>
      {open &&
        createPortal(
        <>
          <span className="acct-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />
          <span className="acct-menu" role="menu" aria-label="Účet" ref={menu} style={at ? ({ '--acct-top': `${at.top}px`, '--acct-right': `${at.right}px` } as CSSProperties) : undefined}>
            <span className="acct-who">
              <b>{name}</b>
              {admin && <span>admin</span>}
            </span>
            {myId && (
              <button type="button" role="menuitem" onClick={pick(() => navigate({ page: 'player', id: myId }))}>
                Můj profil
              </button>
            )}
            <button type="button" role="menuitem" onClick={pick(() => navigate({ page: 'guide' }))}>
              Návod
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={theme === 'dark'} onClick={toggleTheme}>
              Tmavý režim
              <span className={theme === 'dark' ? 'acct-switch on' : 'acct-switch'} aria-hidden="true" />
            </button>
            {admin && (
              <button type="button" role="menuitem" onClick={pick(() => navigate({ page: 'templates' }))}>
                Šablony
              </button>
            )}
            {onChangePassword && (
              <button type="button" role="menuitem" onClick={pick(onChangePassword)}>
                Změnit heslo
              </button>
            )}
            <span className="acct-sep" aria-hidden="true" />
            <button type="button" role="menuitem" className="danger" onClick={pick(onSignOut)}>
              Odhlásit
            </button>
          </span>
        </>,
        document.body,
      )}
    </span>
  );
}

/** Číslo verze vedle názvu Foos Lab (hlavička); vede na stránku Co je nového (20. 11. 2026). */
export function VersionTag() {
  return (
    <a className="brand-version" href={toHash({ page: 'patch-notes' })} title="Verze appky – co je nového" aria-label={`Verze appky ${APP_VERSION} – co je nového`}>
      {APP_VERSION}
    </a>
  );
}

/** Hlavička přihlášení a změny hesla: logo a přepínač režimu. */
export function AuthHeader() {
  return (
    <header className="auth-head">
      <span className="brand">
        <BrandMark />
        Foos Lab
        <VersionTag />
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
