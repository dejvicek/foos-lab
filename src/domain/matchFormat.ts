/**
 * BO formát zápasu (12. 11. 2026): zápasová disciplína se hraje na víc legů – BO1, BO2, BO3 nebo BO5
 * (Best of). Nastavuje se pro každou disciplínu zvlášť v šabloně, v průvodci i ve vlastním
 * tréninku: počet legů, gólů na vyhraný leg a rozhodující (poslední možný) leg volitelně „o 2 góly se
 * stropem“. BO2 hraje oba legy (může skončit nerozhodně). Výchozí BO1 do 6 = dosavadní leg.
 *
 * Leg 1 má skóre pod ID zápasu (jako dřív), další legy pod `ID#n`. Kolo v rozpisu trvá délka legu ×
 * nejvyšší možný počet legů.
 */
import { discipline, roundMin, type DisciplineMins } from './disciplines';
import { legOver } from './legState';
import type { DisciplineId, Match, MatchId, Score } from './types';

export interface MatchFormat {
  /** Nejvyšší počet legů: BO1, BO2, BO3 nebo BO5. */
  bestOf: number;
  /** Gólů na vyhraný leg. */
  legTo: number;
  /** Rozhodující (poslední možný) leg o 2 góly se stropem `cap`. */
  finalWinBy2?: boolean;
  cap?: number;
}

export type MatchFormats = Partial<Record<DisciplineId, MatchFormat>>;

export const DEFAULT_LEG_TO = 6;
export const DEFAULT_CAP = 10;
export const MAX_BEST_OF = 5;
/** Gólů na leg nejvýš 10 (12. 11. 2026); strop rozhodujícího legu nad tím. */
export const MAX_LEG_TO = 10;
export const MAX_CAP = 15;
/** Povolené počty legů (12. 11. 2026 jen BO1, BO2, BO3 a BO5). */
export const BEST_OF_OPTIONS = [1, 2, 3, 5] as const;

export const DEFAULT_FORMAT: MatchFormat = { bestOf: 1, legTo: DEFAULT_LEG_TO };

/** Výchozí pravidla podle počtu legů (12. 11. 2026, *rozhodnutí uživatele*) – nastaví se při volbě BO. */
const BO_DEFAULTS: Record<number, Omit<MatchFormat, 'bestOf'>> = {
  1: { legTo: 6 },
  2: { legTo: 6 },
  3: { legTo: 6, finalWinBy2: true, cap: 10 },
  5: { legTo: 5, finalWinBy2: true, cap: 8 },
};

/** Formát po volbě BO: výchozí pravidla pro daný počet legů (u scénáře v jeho mezích). */
export const defaultFormat = (id: DisciplineId, bestOf: number): MatchFormat => normalizeFormat(id, { bestOf, ...(BO_DEFAULTS[bestOf] ?? BO_DEFAULTS[1]) });

/** Scénář 5:5 má vlastní pravidlo (o 2 góly, strop 10) – nastavit jde jen počet legů. */
export const fixedLegRule = (id: DisciplineId): boolean => {
  const s = discipline(id)?.start;
  return !!s && s[0] === 5 && s[1] === 5;
};

/** Nejnižší povolený počet gólů na leg: víc, než má kterákoli strana na startu scénáře. */
export const minLegTo = (id: DisciplineId): number => Math.max(1, ...(discipline(id)?.start ?? [0, 0]).map((x) => x + 1));

/** Platný formát (meze, celá čísla); nesmyslné hodnoty → nejbližší platné. */
export function normalizeFormat(id: DisciplineId, f: Partial<MatchFormat> | undefined): MatchFormat {
  const clamp = (v: unknown, lo: number, hi: number, def: number) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : def;
    return Math.min(hi, Math.max(lo, n));
  };
  // Jiný počet (např. BO4) → nejbližší nižší povolený.
  const n = clamp(f?.bestOf, 1, MAX_BEST_OF, 1);
  const bestOf = [...BEST_OF_OPTIONS].reverse().find((x) => x <= n) ?? 1;
  if (fixedLegRule(id)) return { bestOf, legTo: DEFAULT_LEG_TO };
  const legTo = clamp(f?.legTo, minLegTo(id), MAX_LEG_TO, Math.max(DEFAULT_LEG_TO, minLegTo(id)));
  // BO2 hraje oba legy a nerozhodný stav je platný výsledek – rozhodující leg nemá.
  if (!f?.finalWinBy2 || bestOf === 2) return { bestOf, legTo };
  return { bestOf, legTo, finalWinBy2: true, cap: clamp(f.cap, legTo + 1, MAX_CAP, Math.max(DEFAULT_CAP, legTo + 1)) };
}

/** Formát disciplíny v tréninku / šabloně; bez nastavení BO1 do 6. */
export const formatOf = (formats: MatchFormats | null | undefined, id: DisciplineId): MatchFormat => normalizeFormat(id, formats?.[id]);

export const isDefaultFormat = (f: MatchFormat): boolean => f.bestOf === 1 && f.legTo === DEFAULT_LEG_TO && !f.finalWinBy2;

/** Jen nevýchozí formáty zápasových disciplín (co se ukládá). */
export function cleanFormats(formats: MatchFormats | null | undefined): MatchFormats | undefined {
  const out: MatchFormats = {};
  for (const [id, f] of Object.entries(formats ?? {}) as [DisciplineId, MatchFormat][]) {
    if (discipline(id)?.kind !== 'match') continue;
    const n = normalizeFormat(id, f);
    if (!isDefaultFormat(n)) out[id] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

/** „BO3 do 5, rozhodující o 2 (strop 8)“; výchozí BO1 do 6 → prázdné. */
export function formatLabel(f: MatchFormat): string {
  if (isDefaultFormat(f)) return '';
  const parts = [`BO${f.bestOf}`];
  if (f.legTo !== DEFAULT_LEG_TO || f.finalWinBy2) parts.push(`do ${f.legTo}`);
  if (f.finalWinBy2) parts.push(`${f.bestOf > 1 ? 'rozhodující leg ' : ''}o 2 (strop ${f.cap})`);
  return parts.join(' ');
}

/**
 * Délky kol pro časy: zápas s BO trvá délka legu × nejvyšší počet legů. Ostatní disciplíny beze
 * změny (chybějící délka zůstává chybějící, ať platí výchozí z kódu).
 */
export function formatMins(mins: DisciplineMins | null | undefined, formats: MatchFormats | null | undefined): DisciplineMins | null | undefined {
  const scaled = Object.entries(formats ?? {}).filter(([id]) => discipline(id as DisciplineId)?.kind === 'match');
  if (!scaled.length) return mins;
  const out: DisciplineMins = { ...mins };
  for (const [id] of scaled) out[id as DisciplineId] = roundMin(id as DisciplineId, mins) * formatOf(formats, id as DisciplineId).bestOf;
  return out;
}

/** Pravidla zápasu z formátu (ukládají se do zápasu v rozpisu, zamčená kola si je nesou). */
export function withFormat(m: Match, f: MatchFormat): Match {
  if (isDefaultFormat(f)) return m;
  return { ...m, bestOf: f.bestOf, legTo: f.legTo, ...(f.finalWinBy2 ? { finalWinBy2: true, cap: f.cap } : {}) };
}

export const legId = (id: MatchId, n: number): MatchId => (n <= 1 ? id : `${id}#${n}`);

/** Leg zápasu jako samostatný zápas: vlastní ID skóre a pravidla konce (rozhodující o 2 se stropem). */
export function legOf(m: Match, n: number): Match {
  const last = n === (m.bestOf ?? 1);
  return { ...m, id: legId(m.id, n), legNo: n, ...(last && m.finalWinBy2 ? { winBy2: true } : {}) };
}

export interface LegResult {
  leg: Match;
  score: Score | undefined;
  over: boolean;
  winner: 'A' | 'B' | null;
}

export interface MatchState {
  /** Legy, které se hrají nebo odehrály (do prvního nedohraného včetně). */
  legs: LegResult[];
  legsA: number;
  legsB: number;
  /** Zápas rozhodnutý (nebo odehrané všechny legy). */
  over: boolean;
  winner: 'A' | 'B' | null;
  /** Leg, který se hraje; null = zápas skončil. */
  current: Match | null;
}

/**
 * Stav zápasu po legech. Rozhodnuto, když má jedna strana víc než polovinu legů (BO2: až po obou
 * legech, může být nerozhodně).
 */
export function matchState(m: Match, scores: Record<MatchId, Score>): MatchState {
  const bestOf = m.bestOf ?? 1;
  const legs: LegResult[] = [];
  let a = 0;
  let b = 0;
  let current: Match | null = null;
  for (let n = 1; n <= bestOf; n++) {
    const leg = legOf(m, n);
    const s = scores[leg.id];
    const r = legOver(leg, s);
    legs.push({ leg, score: s, over: r.over, winner: r.winner });
    if (r.winner === 'A') a++;
    if (r.winner === 'B') b++;
    if (!r.over) {
      current = leg;
      break;
    }
    if (a * 2 > bestOf || b * 2 > bestOf) break;
  }
  const decided = a * 2 > bestOf || b * 2 > bestOf;
  const over = current === null && (decided || legs.length === bestOf);
  return { legs, legsA: a, legsB: b, over, winner: over ? (a > b ? 'A' : b > a ? 'B' : null) : null, current };
}

/** Všechna ID skóre zápasu (všechny možné legy). */
export const legIds = (m: Match): MatchId[] => Array.from({ length: m.bestOf ?? 1 }, (_, i) => legId(m.id, i + 1));

/** ID zápasu z ID legu (`…#2` → `…`). */
export const baseMatchId = (id: MatchId): MatchId => id.replace(/#\d+$/, '');
