import { discipline } from '../../domain/disciplines';
import { legCap, legTarget, winsByTwo } from '../../domain/legState';
import { nextBreak, rowType, type ProgressSeg } from '../../domain/progress';
import type { Assignment } from '../../domain/my';
import { clockAt } from '../../domain/solo';
import type { Match, PlayerId } from '../../domain/types';

/**
 * Moje hry (18. 11. 2026, *rozhodnutí uživatele*; od 19. 11. 2026 jako dlaždice kola v Rozpisu): nahoře čára průběhu tréninku (kola v čase,
 * barva podle typu, pauzy, kde jsem), pod ní „Kolo 5 ze 14“, typ · stůl · čas, velký název disciplíny a
 * pravidlo jednou větou. Bez výplně – nadpis nemá vypadat jako tlačítko; zlatá je jen pro tlačítka.
 */

/** „ze“ před číslem, které se vyslovuje se sykavkou / č (ze 4, ze 14, ze 17), jinak „z“. */
export const zeOf = (n: number): string => ([4, 6, 7, 14, 16, 17].includes(n) || (n >= 40 && n < 50) || (n >= 60 && n < 80) ? 'ze' : 'z');
const kol = (n: number) => (n === 1 ? 'kolo' : n >= 2 && n <= 4 ? 'kola' : 'kol');
const odeh = (n: number) => (n === 1 ? 'odehrané' : n >= 2 && n <= 4 ? 'odehraná' : 'odehraných');

/** Název disciplíny kola: z katalogu, u klasického tréninku z pravidla kola. */
export function roundName(a: Assignment): string {
  if (a.row.discipline) return discipline(a.row.discipline).name;
  return (a.row.rule ?? a.row.label).split(',')[0];
}

function formatText(m: Match): string {
  const top = `do ${legTarget(m)}`;
  const two = winsByTwo(m) ? `, o 2 (strop ${legCap(m)})` : '';
  return (m.bestOf ?? 1) > 1 ? `BO${m.bestOf}, leg ${top}` : `${top}${two}`;
}

/** Pravidlo kola jednou větou z pohledu hráče. */
export function roundRule(a: Assignment, me: PlayerId): string {
  if (a.role === 'wait') return 'Toto kolo nehraješ.';
  const m = a.match;
  if (a.group) {
    const c = a.group;
    if (c.discipline === 'warmup') return 'Rozcvička podle časovače, každý sám.';
    // Co se počítá, je v názvu kola – neopakuje se (19. 11. 2026).
    return c.metric ? '' : (a.row.rule ?? '');
  }
  if (!m) return a.row.rule ?? '';
  if (m.block === 'sim') return a.row.rule ? `Simulace ligového kola, ${a.row.rule}.` : 'Simulace ligového kola.';
  const parts: string[] = [];
  if (a.role === 'referee') parts.push(m.trackLosses ? 'Jsi rozhodčí: čárkuješ ztráty' : 'Jsi rozhodčí');
  const mine: 'A' | 'B' = m.sideA.includes(me) ? 'A' : 'B';
  if (m.start && a.role === 'play') {
    const [x, y] = mine === 'A' ? m.start : [m.start[1], m.start[0]];
    parts.push(`Začínáte za stavu ${x}:${y} (vy ${x}, soupeř ${y})`);
  }
  if (m.wall && a.role === 'play') parts.push(m.wall === mine ? 'Vaše strana drží zeď' : 'Soupeř drží zeď, vy ji lámete');
  if (m.lossTax && a.role === 'play') parts.push('Ztráta = gól soupeře, ztráty čárkuje rozhodčí');
  // BO formát je v hlavičce kola vpravo – tady se neopakuje (19. 11. 2026).
  if ((m.bestOf ?? 1) === 1) parts.push(`hraje se ${formatText(m)}`);
  if (!parts.length) return '';
  const s = parts.join(' · ');
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

/** Popis čáry průběhu pro čtečky: „Kolo 5 ze 14, 4 odehraná, zbývá 9 kol, pauza 10 min v 19:30 (za 2 kola)“. */
export function progressLabel(segs: ProgressSeg[], current: number, startTime: string): string {
  const total = segs.filter((x) => x.kind === 'round').length;
  const left = total - current - 1;
  const br = nextBreak(segs, current);
  const pause = br
    ? `pauza ${br.min} min v ${clockAt(startTime, br.time)} (${br.afterRounds === 0 ? 'po tomhle kole' : `za ${br.afterRounds} ${kol(br.afterRounds)}`})`
    : 'žádná další pauza';
  return `Kolo ${current + 1} ${zeOf(total)} ${total}, ${current} ${odeh(current)}, zbývá ${left} ${kol(left)}, ${pause}`;
}

/**
 * Časová osa tréninku nahoře v Moje hry (18. 11. 2026; od 19. 11. 2026 klikací): kola v čase (barva podle typu),
 * pauzy, ▼ zobrazené kolo. Ťuknutí na kolo ho otevře; po stranách ‹ › o kolo zpět / dál.
 */
export function MyTimeline({
  segs,
  current,
  startTime,
  onPick,
  prev,
  next,
}: {
  segs: ProgressSeg[];
  current: number;
  startTime: string;
  onPick(index: number): void;
  prev: { disabled: boolean; onClick(): void };
  next: { disabled: boolean; onClick(): void };
}) {
  return (
    <div className="my-tl">
      <button type="button" className="icon" aria-label="Předchozí kolo" disabled={prev.disabled} onClick={prev.onClick}>
        ‹
      </button>
      <span className="prog" role="group" aria-label={progressLabel(segs, current, startTime)}>
        {segs.map((x, i) =>
          x.kind === 'break' ? (
            <span key={i} className="pz" style={{ flexGrow: x.min }} title={`Pauza ${x.min} min · ${clockAt(startTime, x.time)}`} />
          ) : (
            <button
              key={i}
              type="button"
              className={`seg t-${x.type}${x.index! < current ? ' done' : x.index === current ? ' cur' : ''}`}
              style={{ flexGrow: x.min }}
              aria-label={`${x.index! + 1}. kolo: ${roundName({ row: x.row, role: 'wait' })}, ${clockAt(startTime, x.time)}`}
              aria-current={x.index === current ? 'step' : undefined}
              onClick={() => onPick(x.index!)}
            />
          ),
        )}
      </span>
      <button type="button" className="icon" aria-label="Další kolo" disabled={next.disabled} onClick={next.onClick}>
        ›
      </button>
    </div>
  );
}

/**
 * Hlavička kola v Moje hry stejně jako dlaždice kola v Rozpisu (19. 11. 2026, *rozhodnutí uživatele*): čas vlevo,
 * název disciplíny uprostřed (zlatě), formát vpravo; pod tím délka kola a pravidlo jednou větou.
 */
export function RoundTileHead({
  a,
  name,
  format,
  min,
  startTime,
  me,
  inline,
}: {
  a: Assignment;
  name: string;
  format: string | null;
  min?: number;
  startTime: string;
  me: PlayerId;
  inline?: boolean;
}) {
  const Box = inline ? 'span' : 'div';
  const Name = inline ? 'span' : 'h2';
  const Line = inline ? 'span' : 'p';
  return (
    <Box className={`tile-head my-head t-${rowType(a.row)}`}>
      <span className="tile-top">
        <span className="tile-time">{clockAt(startTime, a.row.time)}</span>
        <Name className="tile-name">{name}</Name>
        <span className="tile-fmt">{format}</span>
      </span>
      {/* „Kolo 2 ze 14“ ukazuje časová osa nahoře – tady jen délka (19. 11. 2026). */}
      {min ? <span className="tile-sub">{min} min</span> : null}
      {roundRule(a, me) && <Line className="my-rule">{roundRule(a, me)}</Line>}
    </Box>
  );
}
