import { useEffect, useState } from 'react';
import { loadTheme, saveTheme, type Theme } from '../storage/prefs';

const COLOR: Record<Theme, string> = { light: '#FFFFFF', dark: '#0D0E10' };

const systemTheme = (): Theme =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

/** Režim na stránce: zvolený → data-theme (styly ho mají vedle systémového), barva lišty prohlížeče podle něj. */
export function applyTheme(t: Theme | null): void {
  const root = document.documentElement;
  if (t) root.dataset.theme = t;
  else delete root.dataset.theme;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const own = m.media.includes('dark') ? 'dark' : 'light';
    m.content = COLOR[t ?? own];
  });
}

/** Aktuální režim (zvolený, jinak systémový) a přepnutí na opačný; volba se pamatuje v zařízení. */
export function useTheme(): [Theme, () => void] {
  const [chosen, setChosen] = useState<Theme | null>(loadTheme);
  const [system, setSystem] = useState<Theme>(systemTheme);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const theme = chosen ?? system;
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    saveTheme(next);
    applyTheme(next);
    setChosen(next);
  };
  return [theme, toggle];
}
