import type { Route } from '../useHashRoute';

const ITEMS: { label: string; route: Route; match: Route['page'][] }[] = [
  { label: 'Trénink', route: { page: 'trainings' }, match: ['trainings', 'training'] },
  { label: 'Žebříček', route: { page: 'ladder' }, match: ['ladder', 'player'] },
  { label: 'Hráči', route: { page: 'players' }, match: ['players'] },
];

export function MainNav({
  route,
  navigate,
  myName,
  onChangePassword,
  onSignOut,
}: {
  route: Route;
  navigate: (r: Route) => void;
  myName?: string | null;
  onChangePassword?(): void;
  onSignOut?(): void;
}) {
  return (
    <nav className="main-nav" aria-label="Hlavní navigace">
      <span className="brand">Rozpis stolů</span>
      {ITEMS.map((it) => {
        const active = it.match.includes(route.page);
        return (
          <button
            key={it.label}
            type="button"
            className={active ? 'active' : undefined}
            aria-current={active ? 'page' : undefined}
            onClick={() => navigate(it.route)}
          >
            {it.label}
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
