import type { ReactNode } from 'react';
import { BREAK_OPTIONS, type TimelineItem } from '../../domain/plan';
import { discipline } from '../../domain/disciplines';

/**
 * Společné kousky tabulky plánu (9. / 10. 11. 2026): stránka Šablony a krok Disciplíny v průvodci.
 * Řádek: čas | pruh | ⠿ | disciplína | ↑↓ | kola | délka kola | celkem (třídy `tt-*` ve styles.css).
 */
export const KIND_TITLE = { drill: 'Cvičení', match: 'Zápasy a scénáře', sim: 'Simulace' } as const;
export type Kind = keyof typeof KIND_TITLE;
export const KINDS: Kind[] = ['drill', 'match', 'sim'];

/** Výška řádku podle času (px za minutu), nejméně na jeden řádek ovládání. */
const PX_PER_MIN = 4.2;
export const rowHeight = (min: number, least = 44) => Math.max(least, Math.round(min * PX_PER_MIN));

/** Úsek tabulky: od–do (minuty od začátku tréninku). */
export interface Span {
  start: number;
  end: number;
}

/** Jak se čas ukazuje: v šabloně od nuly (0:45), v tréninku hodiny (18:45). */
export type TimeFormat = (min: number) => string;

export function TimeCell({ span, fmt }: { span?: Span; fmt: TimeFormat }) {
  return (
    <span className="tt-time">
      {span ? (
        <>
          <b>{fmt(span.start)}</b>
          <span>{fmt(span.end)}</span>
        </>
      ) : (
        '–'
      )}
    </span>
  );
}

/** Čára „konec“ uvnitř prvního řádku, do kterého délka tréninku padne (jedna na tabulku). */
export function endLiner(durationMin: number, fmt: TimeFormat): (span: Span) => ReactNode {
  let shown = false;
  return (span) => {
    const d = durationMin;
    if (shown || d < span.start || d > span.end || span.end === span.start) return null;
    shown = true;
    return (
      <span className="tt-end" style={{ top: `${((d - span.start) / (span.end - span.start)) * 100}%` }}>
        <span>konec {fmt(d)}</span>
      </span>
    );
  };
}

export function SectionHead({ kind, chosen, total, extra }: { kind: Kind; chosen: number; total: number; extra?: ReactNode }) {
  return (
    <h3>
      <i className={`k-${kind}`} />
      {KIND_TITLE[kind]}
      {extra}
      <span className="tpl-count">
        {chosen} z {total}
      </span>
    </h3>
  );
}

/** Počet kol − / +. */
export function CountStepper({
  n,
  step,
  min,
  max = 20,
  lessLabel,
  moreLabel,
  countLabel,
  onChange,
}: {
  n: number;
  step: number;
  min: number;
  max?: number;
  lessLabel: string;
  moreLabel: string;
  countLabel: string;
  onChange(v: number): void;
}) {
  return (
    <span className="tt-rounds tt-count">
      <button type="button" className="icon" aria-label={lessLabel} disabled={n - step < min} onClick={() => onChange(n - step)}>
        −
      </button>
      <output aria-label={countLabel}>{n}×</output>
      <button type="button" className="icon" aria-label={moreLabel} disabled={n + step > max} onClick={() => onChange(n + step)}>
        +
      </button>
    </span>
  );
}

/** Šipky ↑ ↓ (pořadí disciplíny, posun pauzy). */
export function MoveButtons({ up, down }: { up: { label: string; disabled: boolean; onClick(): void }; down: { label: string; disabled: boolean; onClick(): void } }) {
  return (
    <span className="tpl-move">
      <button type="button" className="icon" aria-label={up.label} disabled={up.disabled} onClick={up.onClick}>
        ↑
      </button>
      <button type="button" className="icon" aria-label={down.label} disabled={down.disabled} onClick={down.onClick}>
        ↓
      </button>
    </span>
  );
}

/** Řádek pauzy: délka, šipky (o disciplínu dřív / později), odebrat. Bez `onRemove` / šipek jen délka (odehraná část). */
export function PauseRow({
  span,
  min,
  durationMin,
  label,
  name = 'Pauza',
  fmt,
  end,
  onMin,
  onUp,
  onDown,
  onRemove,
}: {
  span: Span;
  min: number;
  durationMin: number;
  label: string;
  name?: string;
  fmt: TimeFormat;
  end: ReactNode;
  onMin(min: number): void;
  onUp?: (() => void) | null;
  onDown?: (() => void) | null;
  onRemove?(): void;
}) {
  return (
    <li className={`tt-row tt-pause${span.end > durationMin ? ' over' : ''}`} style={{ minHeight: rowHeight(min, 40) }} aria-label={label}>
      <TimeCell span={span} fmt={fmt} />
      <span className="tt-strip" />
      <span />
      <span className="tt-pause-name">
        {name}
        <select aria-label="Délka pauzy" value={min} onChange={(e) => onMin(Number(e.target.value))}>
          {BREAK_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </span>
      {onUp !== undefined || onDown !== undefined ? (
        <MoveButtons
          up={{ label: 'Pauzu o disciplínu dřív', disabled: !onUp, onClick: () => onUp?.() }}
          down={{ label: 'Pauzu o disciplínu později', disabled: !onDown, onClick: () => onDown?.() }}
        />
      ) : (
        <span />
      )}
      <span />
      <span />
      <span className="tpl-total">
        {onRemove && (
          <button type="button" className="icon" aria-label="Odebrat pauzu" onClick={onRemove}>
            ×
          </button>
        )}
      </span>
      {end}
    </li>
  );
}

/** Zbývající čas do konce tréninku. */
export function FreeRow({ span, fmt, end }: { span: Span; fmt: TimeFormat; end: ReactNode }) {
  return (
    <li className="tt-row tt-free" style={{ minHeight: rowHeight(span.end - span.start, 36) }}>
      <TimeCell span={span} fmt={fmt} />
      <span className="tt-strip" />
      <span />
      <span className="tt-free-name">volno {span.end - span.start} min</span>
      {end}
    </li>
  );
}

/** „+ pauza“ na hraně řádků (při najetí; na telefonu vždy). */
export function GapButton({ name, onClick }: { name: string; onClick(): void }) {
  return (
    <span className="tt-gap">
      <button type="button" onClick={onClick} aria-label={`Přidat pauzu po: ${name}`}>
        + pauza
      </button>
    </span>
  );
}

/**
 * Čára „Naplánováno“ (12. 11. 2026): úseky v barvách druhu – cvičení, zápasy a scénáře, simulace, pauzy
 * šrafovaně. Měřítko je délka tréninku; přetažený plán sahá na celou šířku a značka ukazuje konec tréninku.
 */
export function PlanMeter({ items, total, durationMin }: { items: TimelineItem[]; total: number; durationMin: number }) {
  const scale = Math.max(total, durationMin, 1);
  const segs: { kind: Kind | 'break'; from: number; to: number }[] = [];
  items.forEach((it, i) => {
    const kind: Kind | 'break' = it.kind === 'break' ? 'break' : discipline(it.discipline!).kind;
    const to = items[i + 1]?.start ?? total; // včetně přechodu do dalšího kola
    const last = segs.at(-1);
    if (last && last.kind === kind && last.to === it.start) last.to = to;
    else segs.push({ kind, from: it.start, to });
  });
  return (
    <span className="tt-meter" aria-hidden="true">
      {segs.map((x, i) => (
        <i key={i} className={`k-${x.kind}`} style={{ left: `${(x.from / scale) * 100}%`, width: `${((x.to - x.from) / scale) * 100}%` }} />
      ))}
      {total > durationMin && <b className="tt-meter-end" style={{ left: `${(durationMin / scale) * 100}%` }} />}
    </span>
  );
}
