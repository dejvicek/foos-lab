import { discipline } from '../../domain/disciplines';
import { legCap, legTarget, winsByTwo } from '../../domain/legState';
import { nextBreak, ROUND_TYPE_NAME, rowType, type ProgressSeg } from '../../domain/progress';
import type { Assignment } from '../../domain/my';
import { clockAt, soloMetric } from '../../domain/solo';
import type { Match, PlayerId } from '../../domain/types';

/**
 * Nadpis kola v Moje hry (18. 11. 2026, *rozhodnutí uživatele*): nahoře čára průběhu tréninku (kola v čase,
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
    return c.metric ? `Počítají se ${soloMetric(c.metric).what}.` : (a.row.rule ?? '');
  }
  if (!m) return a.row.rule ?? '';
  if (m.block === 'sim') return a.row.rule ? `Simulace ligového kola, ${a.row.rule}.` : 'Simulace ligového kola.';
  const parts: string[] = [];
  if (a.role === 'referee') parts.push(m.trackLosses ? `Jsi rozhodčí u stolu ${a.table}: čárkuješ ztráty` : `Jsi rozhodčí u stolu ${a.table}`);
  const mine: 'A' | 'B' = m.sideA.includes(me) ? 'A' : 'B';
  if (m.start && a.role === 'play') {
    const [x, y] = mine === 'A' ? m.start : [m.start[1], m.start[0]];
    parts.push(`Začínáte za stavu ${x}:${y} (vy ${x}, soupeř ${y})`);
  }
  if (m.wall && a.role === 'play') parts.push(m.wall === mine ? 'Vaše strana drží zeď' : 'Soupeř drží zeď, vy ji lámete');
  if (m.lossTax && a.role === 'play') parts.push('Ztráta = gól soupeře, ztráty čárkuje rozhodčí');
  parts.push(`hraje se ${formatText(m)}`);
  const s = parts.join(' · ');
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

interface Props {
  segs: ProgressSeg[];
  /** Pořadí zobrazeného kola (0 = první). */
  current: number;
  a: Assignment;
  me: PlayerId;
  startTime: string;
  /** Krátké zvýraznění při změně kola. */
  flash?: boolean;
  prev?: { disabled: boolean; onClick(): void };
  next?: { disabled: boolean; onClick(): void };
  /** Uvnitř tlačítka (karta dalšího kola): jen řádkové prvky. */
  inline?: boolean;
}

export function RoundHeader({ segs, current, a, me, startTime, flash, prev, next, inline }: Props) {
  const Box = inline ? 'span' : 'div';
  const Name = inline ? 'span' : 'h2';
  const Rule = inline ? 'span' : 'p';
  const total = segs.filter((x) => x.kind === 'round').length;
  const type = rowType(a.row);
  const done = current;
  const left = total - current - 1;
  const br = nextBreak(segs, current);
  const pause = br
    ? `pauza ${br.min} min v ${clockAt(startTime, br.time)} (${br.afterRounds === 0 ? 'po tomhle kole' : `za ${br.afterRounds} ${kol(br.afterRounds)}`})`
    : 'žádná další pauza';
  const label = `Kolo ${current + 1} ${zeOf(total)} ${total}, ${done} ${odeh(done)}, zbývá ${left} ${kol(left)}, ${pause}`;
  const where = a.role === 'wait' ? 'nehraješ' : `stůl ${a.table}`;
  return (
    <Box className={`round-head t-${type}${flash ? ' flash' : ''}`}>
      <span className="prog" role="img" aria-label={label}>
        {segs.map((x, i) =>
          x.kind === 'break' ? (
            <span key={i} className="pz" style={{ flexGrow: x.min }} title={`Pauza ${x.min} min · ${clockAt(startTime, x.time)}`} />
          ) : (
            <span
              key={i}
              className={`seg t-${x.type}${x.index! < current ? ' done' : x.index === current ? ' cur' : ''}`}
              style={{ flexGrow: x.min }}
              title={`${x.index! + 1}. kolo · ${roundName({ row: x.row, role: 'wait' })} · ${clockAt(startTime, x.time)}`}
            />
          ),
        )}
      </span>
      <span className="rh-nav">
        {prev && (
          <button type="button" className="icon" aria-label="Předchozí kolo" disabled={prev.disabled} onClick={prev.onClick}>
            ‹
          </button>
        )}
        <span className="rh-count" aria-hidden="true">
          Kolo {current + 1} {zeOf(total)} {total}
        </span>
        {next && (
          <button type="button" className="icon" aria-label="Další kolo" disabled={next.disabled} onClick={next.onClick}>
            ›
          </button>
        )}
      </span>
      <span className="rh-type">
        {ROUND_TYPE_NAME[type]} · {where} · {clockAt(startTime, a.row.time)}
      </span>
      <Name className="rh-name">{roundName(a)}</Name>
      <Rule className="rh-rule">{roundRule(a, me)}</Rule>
    </Box>
  );
}
