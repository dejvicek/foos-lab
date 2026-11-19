/** České tvary: 1 hráč, 2–4 hráči, 5+ hráčů. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

export const MODE_LABEL = { team: 'Týmový trénink', single: 'Trénink jedniček' } as const;
export const MODE_OPTION = { team: 'Týmový trénink (3 h)', single: 'Trénink jedniček (80 min)' } as const;

const one = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 0.4166 → „0,4“; se znaménkem → „+0,4“ */
export function dec1(v: number, signed = false): string {
  const s = one.format(Math.abs(v));
  if (v < 0 && s !== '0,0') return `\u2212${s}`;
  return signed && v > 0 ? `+${s}` : s;
}

export const pct = (v: number): string => `${Math.round(v * 100)} %`;
export const signed = (v: number): string => (v > 0 ? `+${v}` : v < 0 ? `\u2212${-v}` : '0');

/**
 * Barva rozdílu skóre (19. 11. 2026, *rozhodnutí uživatele*): zelená = výrazný náskok, zlatá = plus, červená = minus,
 * nula bez barvy. Výrazný: aspoň +10 za trénink, aspoň +1,5 na leg (trénink má kolem 7 legů, tedy zhruba totéž).
 */
export const STRONG_PER_LEG = 1.5;
export const STRONG_PER_TRAINING = 10;
export const diffTone = (diff: number, strong: boolean): string => (diff > 0 ? (strong ? 'great' : 'pos') : diff < 0 ? 'neg' : '');
/** Třídy buňky s rozdílem: `n` + barva. */
export const diffCls = (diff: number, strong: boolean): string => ['n', diffTone(diff, strong)].filter(Boolean).join(' ');
