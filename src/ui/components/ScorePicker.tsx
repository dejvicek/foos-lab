import { LEG_CAP, legCap, legTarget, MAX_LOSSES, maxLosses, setLosses, winnerFor } from '../../domain/legState';
import type { Match, PlayerId, Score } from '../../domain/types';

interface Props {
  /** Předpona přístupných jmen, např. „Kolo 3, stůl 1“. */
  label: string;
  match: Match;
  score: Score | undefined;
  names: Record<PlayerId, string>;
  /** Jen ke čtení (přihlášený u stolu nehraje ani nerozhoduje). */
  disabled: boolean;
  onChange(next: Score): void;
}

type Side = 'A' | 'B';
const WORD: Record<Side, string> = { A: 'vlevo', B: 'vpravo' };
/** Řada ztrát 0…8, víc přes „+“ (ve hře jich bývá málo). */
const LOSS_ROW = 8;

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Zápis zápasu na notebooku: u každé strany řada čísel (stav na stole), uprostřed skóre.
 * Levá strana 0→6, pravá 6→0 jako zrcadlo stolu. Ukládá se hned po kliknutí.
 */
export function ScorePicker({ label, match: m, score, names, disabled, onChange }: Props) {
  const s = score ?? {};
  const sim = m.block === 'sim';
  const fiveFive = !!m.start && m.start[0] === 5 && m.start[1] === 5;
  const start = (side: Side) => (side === 'A' ? m.start?.[0] : m.start?.[1]) ?? 0;
  const goalKey = (side: Side): keyof Score => (side === 'A' ? 'ga' : 'gb');
  const lossKey = (side: Side): keyof Score => (side === 'A' ? 'la' : 'lb');
  const table = (side: Side) => {
    const v = s[goalKey(side)];
    return v === undefined || v === null ? null : v + start(side);
  };
  const nm = (ids: PlayerId[]) => ids.map((p) => names[p] ?? '?').join(' + ');

  /** Klik na stav strany; prázdné druhé straně předvyplní vítězný stav (6, u 5:5 o 2 góly, strop 10). */
  const pick = (side: Side, v: number) => {
    const other: Side = side === 'A' ? 'B' : 'A';
    const next: Score = { ...s, [goalKey(side)]: v - start(side) };
    const win = winnerFor(m, v);
    if (table(other) === null && win !== null) next[goalKey(other)] = win - start(other);
    // Daň: ztráty nemohou převýšit góly soupeře (každá je jeho gól) – po snížení gólů se srovnají.
    if (m.lossTax) {
      if (next.la != null && next.gb != null) next.la = Math.min(next.la, next.gb);
      if (next.lb != null && next.ga != null) next.lb = Math.min(next.lb, next.ga);
    }
    onChange(next);
  };

  const goals = (side: Side) => {
    // BO formát: do legTo, rozhodující leg o 2 až do stropu.
    const values = sim ? range(0, 2) : fiveFive ? range(5, LEG_CAP) : range(0, m.winBy2 ? legCap(m) : legTarget(m));
    const shown = side === 'A' ? values : [...values].reverse();
    const cur = table(side);
    return (
      <div className={`pick-chips side-${side.toLowerCase()}`} role="group" aria-label={`${label}: góly ${WORD[side]}`}>
        {shown.map((v) => (
          <button
            key={v}
            type="button"
            className="pick-chip"
            aria-label={`${label}: góly ${WORD[side]} ${v}`}
            aria-pressed={cur === v}
            disabled={disabled || v < start(side)}
            onClick={() => pick(side, v)}
          >
            {v}
          </button>
        ))}
      </div>
    );
  };

  const losses = (side: Side) => {
    const k = lossKey(side) as 'la' | 'lb';
    const cur = s[k] ?? null;
    // Daň: každá ztráta je gól soupeře → nejvýš tolik, kolik má soupeř gólů.
    const cap = maxLosses(m, s, k);
    // Druhá strana dostane 0 (ztráty se počítají jen z legů, kde jsou u obou stran); u Daně se mění i góly soupeře.
    const set = (v: number) => onChange(setLosses(m, s, k, v));
    const chips = range(0, Math.min(LOSS_ROW, cap)).map((v) => (
      <button
        key={v}
        type="button"
        className="pick-chip loss"
        aria-label={`${label}: ztráty ${WORD[side]} ${v}`}
        aria-pressed={cur === v}
        disabled={disabled}
        onClick={() => set(v)}
      >
        {v}
      </button>
    ));
    if (cur !== null && cur > LOSS_ROW && cap > LOSS_ROW)
      chips.push(
        <button key="cur" type="button" className="pick-chip loss" aria-label={`${label}: ztráty ${WORD[side]} ${cur}`} aria-pressed disabled={disabled}>
          {cur}
        </button>,
      );
    if (cap > LOSS_ROW)
      chips.push(
      <button
        key="more"
        type="button"
        className="pick-chip loss more"
        aria-label={`${label}: ztráty ${WORD[side]} víc`}
        disabled={disabled || (cur ?? 0) >= MAX_LOSSES}
        onClick={() => set(Math.max(LOSS_ROW + 1, (cur ?? 0) + 1))}
      >
        +
      </button>,
    );
    return (
      <div className={`pick-losses side-${side.toLowerCase()}`} role="group" aria-label={`${label}: ztráty ${WORD[side]}`}>
        {side === 'A' ? chips : chips.reverse()}
      </div>
    );
  };

  const tags = (side: Side) => (
    <>
      {m.wall && <span className={m.wall === side ? 'tag tag-wall' : 'tag tag-break'}>{m.wall === side ? 'Zeď' : 'Láme zeď'}</span>}
      {m.start && <span className="tag tag-start">začíná {start(side)}</span>}
    </>
  );

  const [a, b] = [table('A'), table('B')];
  const any = a !== null || b !== null || s.la != null || s.lb != null;
  return (
    <div className="picker">
      <div className="pick-row pick-names">
        <div className="pick-a">
          {nm(m.sideA)} {tags('A')}
        </div>
        <div />
        <div className="pick-b">
          {tags('B')} {nm(m.sideB)}
        </div>
      </div>
      <div className="pick-row">
        {goals('A')}
        <div className={a === null && b === null ? 'pick-score empty' : 'pick-score'}>
          {a ?? '–'} : {b ?? '–'}
          {m.start && a !== null && b !== null && (
            <small>
              odehráno {s.ga} : {s.gb}
            </small>
          )}
        </div>
        {goals('B')}
      </div>
      {m.trackLosses && (
        <div className="pick-row">
          {losses('A')}
          <span className="pick-k">ztráty</span>
          {losses('B')}
        </div>
      )}
      {any && !disabled && (
        <button type="button" className="link pick-clear" aria-label={`${label}: vymazat`} onClick={() => onChange({})}>
          vymazat
        </button>
      )}
    </div>
  );
}
