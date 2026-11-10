import { useTheme } from '../theme';

/** Přepínač světlého / tmavého režimu v hlavičce (pamatuje si ho zařízení). */
export function ThemeSwitch() {
  const [theme, toggle] = useTheme();
  const label = theme === 'dark' ? 'Světlý režim' : 'Tmavý režim';
  return (
    <button type="button" className="theme-switch" aria-label={label} title={label} onClick={toggle}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        )}
      </svg>
    </button>
  );
}
