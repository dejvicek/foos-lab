/**
 * Délka kola z doby míčku (18. 11. 2026, *rozhodnutí uživatele*): kolo trvá dobu míčku × nejvíc míčků v kole,
 * zaokrouhleno nahoru na celé minuty.
 *  - Zápas a vlna simulace: míček = gól; nejvyšší možný počet gólů ve formátu (BO, gólů na leg, rozhodující
 *    leg o 2 se stropem, u scénářů jen odehrané góly). Výchozí doba míčku 40 s.
 *  - Cvičení s pokusy: míček = pokus; ve dvojici (s bránícím soupeřem) má každý hráč plný počet pokusů a pak se
 *    vystřídají (40 míčků), sólové cvičení jen plný počet (20). Výchozí doba míčku 20 s.
 *  - Čistá desítka (na čas) a Rozcvička (timer) mají dál pevnou délku kola v minutách.
 * Admin může dobu míčku u disciplíny přepsat.
 *
 * Trénink si doby míčků uloží při založení / úpravě (`Training.ballSec`); trénink bez nich počítá jako dřív
 * (délka kola z `disciplineMin`, zápas délka legu × počet legů), takže časy starších tréninků se nemění.
 */
import { discipline, DISCIPLINES, type DisciplineDef, type DisciplineMins } from './disciplines';
import { legCap, legTarget, winsByTwo } from './legState';
import { DEFAULT_FORMAT, formatMins, formatOf, legOf, SIM_FORMATS, withFormat, type MatchFormat, type MatchFormats } from './matchFormat';
import { isStreak, soloMetric } from './solo';
import type { DisciplineId, Match } from './types';

/**
 * Výchozí doba míčku zápasů a simulace v sekundách, stejná pro všechny: 40 s (18. 11. 2026, *rozhodnutí
 * uživatele*; celkový průměr změřených zápasů z 17. 11. 2026 byl 36,8 s).
 */
export const DEFAULT_BALL_SEC = 40;
/** Výchozí doba míčku (pokusu) cvičení: 20 s (18. 11. 2026, *rozhodnutí uživatele*). */
export const DEFAULT_DRILL_BALL_SEC = 20;
/** Výchozí doba míčku jednotlivých disciplín, kde se liší (18. 11. 2026, *rozhodnutí uživatele*): Řetězec 30 s. */
const DEFAULT_BALL_SEC_OF: BallSecs = { chain: 30 };
export const MIN_BALL_SEC = 5;
export const MAX_BALL_SEC = 300;

export type BallSecs = Partial<Record<DisciplineId, number>>;

/** Cvičení na čas (Čistá desítka): délka kola v minutách, reálně se měří celkový čas. */
export const isStreakDrill = (d: DisciplineDef | undefined): boolean => !!d && d.kind === 'drill' && !!d.metric && isStreak(soloMetric(d.metric));

/** Cvičení s pokusy (míčky): má metriku a není na čas. Rozcvička (bez metriky) ani Čistá desítka ne. */
const ballDrill = (d: DisciplineDef | undefined): boolean => !!d && d.kind === 'drill' && !!d.metric && !isStreakDrill(d);

/** Definice disciplíny, jejíž délka kola se počítá z doby míčku: zápas, simulace, cvičení s pokusy. */
export const ballDef = (d: DisciplineDef | undefined): boolean => !!d && (d.kind === 'match' || d.kind === 'sim' || ballDrill(d));
/** Disciplína, jejíž délka kola se počítá z doby míčku: zápasy, simulace a cvičení s pokusy. */
export const usesBalls = (id: DisciplineId): boolean => ballDef(discipline(id));

export const validBallSec = (s: unknown): s is number => typeof s === 'number' && Number.isInteger(s) && s >= MIN_BALL_SEC && s <= MAX_BALL_SEC;

/** Výchozí doba míčku disciplíny: cvičení 20 s (Řetězec 30 s), zápasy a simulace 40 s. */
export const defaultBallSec = (id: DisciplineId): number => DEFAULT_BALL_SEC_OF[id] ?? (discipline(id)?.kind === 'drill' ? DEFAULT_DRILL_BALL_SEC : DEFAULT_BALL_SEC);

/** Doba míčku disciplíny v aktuálním katalogu: úprava admina, jinak výchozí. */
export const ballSecOf = (id: DisciplineId): number => discipline(id)?.ballSec ?? defaultBallSec(id);

/** Snímek dob míčků (zápasy, simulace, cvičení s pokusy) – ukládá se do nového / upraveného tréninku. */
export const catalogBallSec = (): BallSecs => Object.fromEntries(DISCIPLINES.filter((d) => !d.retired && usesBalls(d.id)).map((d) => [d.id, ballSecOf(d.id)]));

/** Nejvíc odehraných gólů v legu: vítěz na cíli (u legu o 2 na stropu), poražený o 1 méně; scénářový start se odečte. */
export function maxLegGoals(m: Match): number {
  const [sa, sb] = m.start ?? [0, 0];
  const top = winsByTwo(m) ? legCap(m) : legTarget(m);
  return Math.max(0, 2 * top - 1 - sa - sb);
}

/** Nejvíc gólů v zápase disciplíny při daném formátu (všechny možné legy). */
export function maxGoals(id: DisciplineId, f: MatchFormat): number {
  const d = discipline(id);
  const base: Match = { id: 'x', block: d.kind === 'sim' ? 'sim' : 'league', round: 1, table: 1, kind: 'doubles', sideA: [], sideB: [], ...(d.start ? { start: d.start } : {}) };
  const m = withFormat(base, f);
  let sum = 0;
  for (let n = 1; n <= (m.bestOf ?? 1); n++) sum += maxLegGoals(legOf(m, n));
  return sum;
}

/**
 * Míčky v kole cvičení: plný počet pokusů hráče; s bránícím soupeřem se dvojice po plném počtu vystřídá
 * (každý hráč svůj plný počet, 18. 11. 2026). Trojice u stolu se nepočítá – kolo je pro dvojici.
 */
export function drillBalls(id: DisciplineId): number {
  const d = discipline(id);
  if (!ballDrill(d)) return 0;
  return soloMetric(d.metric!).max * (d.needsPartner ? 2 : 1);
}

const minutes = (sec: number) => Math.max(1, Math.ceil(sec / 60));

/** Délka kola zápasu z doby míčku: zápas = celé kolo; simulace = 2 vlny, každá na jeden zápas. */
export function goalRoundMin(id: DisciplineId, f: MatchFormat, ballSec: number): number {
  const one = minutes(ballSec * maxGoals(id, f));
  return discipline(id).kind === 'sim' ? 2 * one : one;
}

/** Délka kola cvičení z doby míčku: doba míčku × míčky v kole. */
export const drillRoundMin = (id: DisciplineId, ballSec: number): number => minutes(ballSec * drillBalls(id));

/** Délka kola disciplíny s dobou míčku (zápas v daném formátu, cvičení z pokusů). */
export const ballRoundMin = (id: DisciplineId, f: MatchFormat, ballSec: number): number =>
  discipline(id).kind === 'drill' ? drillRoundMin(id, ballSec) : goalRoundMin(id, f, ballSec);

/**
 * Délka kola v katalogu (stránka Disciplíny, 18. 11. 2026, *rozhodnutí uživatele*): zápasy vždy jako BO1 do 6
 * (scénář od svého startu, 5:5 o 2 se stropem 10); simulace v obou svých formátech (catalogSimMins), délka
 * kola = výchozí BO3; cvičení z pokusů. V tréninku platí jeho formát.
 */
export const CATALOG_FORMAT: MatchFormat = DEFAULT_FORMAT;
export const catalogRoundMin = (id: DisciplineId): number => {
  if (!usesBalls(id)) return discipline(id).min;
  return ballRoundMin(id, discipline(id).kind === 'sim' ? SIM_FORMATS[0] : CATALOG_FORMAT, ballSecOf(id));
};

/** Simulace na stránce Disciplíny: délka vlny a kola (2 vlny) pro každý její formát. */
export const catalogSimMins = (): { format: MatchFormat; wave: number; min: number }[] =>
  SIM_FORMATS.map((format) => {
    const min = goalRoundMin('sim', format, ballSecOf('sim'));
    return { format, wave: min / 2, min };
  });

/**
 * Délky kol pro časovou osu: s dobou míčku z míčků (zápas ve formátu tréninku), jinak jako dřív
 * (formatMins: délka legu × počet legů; simulace a cvičení beze změny).
 */
export function roundMinutes(mins: DisciplineMins | null | undefined, formats: MatchFormats | null | undefined, ballSec: BallSecs | null | undefined): DisciplineMins | null | undefined {
  const ids = (Object.keys(ballSec ?? {}) as DisciplineId[]).filter((id) => discipline(id) && usesBalls(id) && validBallSec(ballSec![id]));
  const base = formatMins(mins, formats);
  if (!ids.length) return base;
  const out: DisciplineMins = { ...base };
  for (const id of ids) out[id] = ballRoundMin(id, formatOf(formats, id), ballSec![id]!);
  return out;
}
