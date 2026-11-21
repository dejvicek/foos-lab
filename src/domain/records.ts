import { isClub, isPractice } from './practice';
import { parseSoloKey, SOLO_METRICS, soloMetric } from './solo';
import { validSolo } from './soloLadder';
import type { PlayerId, SoloKey, SoloMetric, Training } from './types';

/**
 * Osobní rekord a rekord klubu u cvičení (20. 11. 2026, *rozhodnutí uživatele*). Počítá se jen celá série
 * (všechny pokusy, starší série s 10 pokusy ne), u Čisté desítky splněná (čas > 0, méně = lépe).
 * Osobní ze všech hráčových sérií; klubový jen z klubových tréninků a tréninků ve dvou (solo nikdo neověřuje).
 */

export interface Bests {
  /** Nejlepší hráčova celá série jinde než v té právě dohrané; null = zatím žádná. */
  personal: number | null;
  /** Nejlepší celá série klubu (kohokoli) jinde; null = žádná. */
  club: number | null;
  /** Kdo rekord klubu drží (při shodě ten, koho najde první). */
  clubHolder: PlayerId | null;
  /** Patří tahle série do rekordu klubu (klubový trénink nebo ve dvou)? */
  clubCounts: boolean;
}

/** Trénink se počítá do rekordu klubu: klubový, nebo vlastní ve dvou. */
export const countsForClub = (t: Training): boolean => isClub(t) || (isPractice(t) && t.attendees.length >= 2);

/** Je `a` lepší než `b` v dané metrice? */
export function better(metric: SoloMetric, a: number, b: number): boolean {
  const def = soloMetric(metric);
  return def.streak || def.lowerIsBetter ? a < b : a > b;
}

/** Hodnota celé série, nebo null (nedohraná, starší kratší, nesplněná desítka). */
export function fullSeries(t: Training, playerId: PlayerId, key: SoloKey): number | null {
  const def = soloMetric(parseSoloKey(key).metric);
  const v = validSolo(t)[playerId]?.[key];
  if (v === undefined || v === null) return null;
  if (def.streak) return v > 0 ? v : null;
  return (t.soloAttempts?.[playerId]?.[key] ?? def.max) === def.max ? v : null;
}

/** Nejlepší celé série hráče a klubu v metrice, bez série `exclude` (ta právě dohraná). */
export function bestsOf(trainings: Training[], metric: SoloMetric, playerId: PlayerId, exclude?: { trainingId: string; key: SoloKey }): Bests {
  let personal: number | null = null;
  let club: number | null = null;
  let clubHolder: PlayerId | null = null;
  const pick = (cur: number | null, v: number) => (cur === null || better(metric, v, cur) ? v : cur);
  for (const t of trainings) {
    const club_ = countsForClub(t);
    for (const [p, values] of Object.entries(validSolo(t)))
      for (const k of Object.keys(values) as SoloKey[]) {
        if (parseSoloKey(k).metric !== metric) continue;
        if (exclude && t.id === exclude.trainingId && k === exclude.key && p === playerId) continue;
        const v = fullSeries(t, p, k);
        if (v === null) continue;
        if (p === playerId) personal = pick(personal, v);
        if (club_ && (club === null || better(metric, v, club))) {
          club = v;
          clubHolder = p as PlayerId;
        }
      }
  }
  const here = exclude && trainings.find((t) => t.id === exclude.trainingId);
  return { personal, club, clubHolder, clubCounts: !!here && countsForClub(here) };
}

/** Co říct po dohrané sérii: nový / vyrovnaný osobní rekord, rekord klubu, jinak připomenout maximum. */
export type RecordNews = { kind: 'club' } | { kind: 'personal'; before: number | null } | { kind: 'equal' } | { kind: 'max'; best: number } | null;

export function recordNews(metric: SoloMetric, value: number, b: Bests): RecordNews {
  if (b.clubCounts && b.club !== null && better(metric, value, b.club)) return { kind: 'club' };
  if (b.personal === null) return null; // první celá série – není s čím srovnat
  if (better(metric, value, b.personal)) return { kind: 'personal', before: b.personal };
  if (value === b.personal) return { kind: 'equal' };
  return { kind: 'max', best: b.personal };
}

/** Rekordy hráče na profilu: u každého cvičení s celou sérií moje maximum a rekord klubu. */
export function recordsOf(trainings: Training[], playerId: PlayerId): { metric: SoloMetric; personal: number; club: number | null; clubHolder: PlayerId | null }[] {
  return SOLO_METRICS.flatMap((m) => {
    const b = bestsOf(trainings, m.id, playerId);
    return b.personal === null ? [] : [{ metric: m.id, personal: b.personal, club: b.club, clubHolder: b.clubHolder }];
  });
}
