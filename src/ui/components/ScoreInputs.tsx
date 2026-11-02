import { useState, type ReactNode } from 'react';
import { parseScoreValue } from '../../domain/standings';
import type { Score } from '../../domain/types';

interface Props {
  label: string;
  score: Score | undefined;
  maxGoals: number;
  withLosses: boolean;
  /** Jména levé a pravé strany; zobrazí se u svého políčka skóre. */
  sides?: [ReactNode, ReactNode];
  /** Scénářový start: zapisuje se stav na stole, ukládají se odehrané góly. */
  start?: [number, number];
  /** Která strana hraje Zeď. */
  wall?: 'A' | 'B';
  /** Jen ke čtení (hráč nemá právo zapisovat). */
  disabled?: boolean;
  onChange(next: Score): void;
}

const show = (v: number | null | undefined, offset = 0) => (v === null || v === undefined ? '' : String(v + offset));

/**
 * Číselné políčko: hodnotu nad maximum nepřijme (překlep 66), hodnotu pod startem
 * nechá dopsat (u startu 5:5 se „10“ píše přes „1“), ale uloží jen platnou.
 */
function Field({
  value,
  offset,
  max,
  label,
  className,
  disabled,
  onCommit,
}: {
  value: number | null | undefined;
  offset: number;
  max: number;
  label: string;
  className: string;
  disabled?: boolean;
  onCommit(v: number | null): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={className}
      type="number"
      inputMode="numeric"
      min={offset}
      max={max}
      placeholder={offset ? String(offset) : '–'}
      aria-label={label}
      aria-invalid={draft !== null ? true : undefined}
      disabled={disabled}
      value={draft ?? show(value, offset)}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') {
          setDraft(null);
          return onCommit(null);
        }
        const v = parseScoreValue(raw);
        if (v !== null && v > max) return; // překlep nad maximum se nepřijme
        if (v === null || v < offset) return setDraft(raw); // rozepsané / pod startem: neukládat
        setDraft(null);
        onCommit(v - offset);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function ScoreInputs({ label, score, maxGoals, withLosses, sides, start, wall, disabled, onChange }: Props) {
  const s = score ?? {};
  const field = (key: keyof Score, max: number, title: string, className: string, offset = 0) => (
    <Field
      value={s[key]}
      offset={offset}
      max={max}
      label={`${label}: ${title}`}
      className={className}
      disabled={disabled}
      onCommit={(v) => onChange({ ...s, [key]: v })}
    />
  );
  const ga = s.ga ?? null;
  const gb = s.gb ?? null;
  const done = ga !== null && gb !== null;
  const won = (mine: number | null, theirs: number | null) => (done && (mine as number) > (theirs as number) ? ' won' : '');
  const tags = (side: 'A' | 'B') => (
    <>
      {wall && <span className={wall === side ? 'tag tag-wall' : 'tag tag-break'}>{wall === side ? 'Zeď' : 'Láme zeď'}</span>}
      {start && <span className="tag tag-start">začíná {start[side === 'A' ? 0 : 1]}</span>}
    </>
  );
  return (
    <div className="result">
      <div className={`result-side${won(ga, gb)}`}>
        <span className="side-tag" aria-hidden="true">L</span>
        <span className="side-name">
          {sides?.[0]} {tags('A')}
        </span>
        {field('ga', maxGoals, 'góly vlevo', 'goal', start?.[0] ?? 0)}
      </div>
      <div className={`result-side${won(gb, ga)}`}>
        <span className="side-tag" aria-hidden="true">P</span>
        <span className="side-name">
          {sides?.[1]} {tags('B')}
        </span>
        {field('gb', maxGoals, 'góly vpravo', 'goal', start?.[1] ?? 0)}
      </div>
      {start && done && (
        <p className="played">
          Odehráno {ga} : {gb}
        </p>
      )}
      {withLosses && (
        <div className="losses">
          <span>Ztráty</span>
          {field('la', 30, 'ztráty vlevo', 'loss')}
          <span aria-hidden="true">/</span>
          {field('lb', 30, 'ztráty vpravo', 'loss')}
        </div>
      )}
    </div>
  );
}
