import { useState } from 'react';
import { bumpLimit, legOver, tableScore } from '../../domain/legState';
import type { SoloMetricDef } from '../../domain/solo';
import type { Match, PlayerId, Score } from '../../domain/types';

type Side = 'A' | 'B';
const SIDE_WORD: Record<Side, string> = { A: 'vlevo', B: 'vpravo' };

interface Props {
  match: Match;
  score: Score | undefined;
  names: Record<PlayerId, string>;
  /** Přihlášený hráč (u jeho strany „vy“). */
  me?: PlayerId | null;
  /** Jen ke čtení – přihlášený u stolu nehraje ani nerozhoduje. */
  disabled: boolean;
  onBump(field: keyof Score, delta: number): void;
}

/**
 * PRD 7.1 „Zrcadlo stolu“: levá a pravá polovina jako u stolu.
 * Ťuknutí do velkého pole = +1 gól (v simulaci set), červené pole = +1 ztráta.
 */
export function ScoreMirror({ match: m, score, names, me, disabled, onBump }: Props) {
  const [undo, setUndo] = useState<(keyof Score)[]>([]);
  const [editing, setEditing] = useState(false);
  const s = score ?? {};
  const sim = m.block === 'sim';
  const shown = sim ? [s.ga ?? 0, s.gb ?? 0] : tableScore(m, s);
  const { over } = legOver(m, s);
  const locked = disabled || (over && !editing);
  const nm = (ids: PlayerId[]) => ids.map((p) => names[p] ?? '?').join(' + ');

  const tap = (field: keyof Score, delta: number) => {
    onBump(field, delta);
    if (delta > 0) setUndo((u) => [...u, field]);
  };
  const back = () => {
    const last = undo[undo.length - 1];
    if (!last) return;
    onBump(last, -1);
    setUndo((u) => u.slice(0, -1));
  };

  const half = (side: Side) => {
    const ids = side === 'A' ? m.sideA : m.sideB;
    const g: keyof Score = side === 'A' ? 'ga' : 'gb';
    const l: keyof Score = side === 'A' ? 'la' : 'lb';
    const value = shown[side === 'A' ? 0 : 1];
    const atCap = (s[g] ?? 0) >= bumpLimit(m, g);
    const word = SIDE_WORD[side];
    return (
      <div className={`mirror-half side-${side.toLowerCase()}`}>
        <div className="mirror-who">
          <strong>{nm(ids)}</strong>
          <small>
            {m.wall && <span className={m.wall === side ? 'tag tag-wall' : 'tag tag-break'}>{m.wall === side ? 'Zeď' : 'Láme zeď'}</span>}
            {m.start && <span className="tag tag-start">začíná {m.start[side === 'A' ? 0 : 1]}</span>}
            {word}
            {me && ids.includes(me) ? ', vy' : ''}
          </small>
        </div>
        <button
          type="button"
          className="mirror-goal"
          aria-label={`Gól ${word} (${nm(ids)}), stav ${value}`}
          disabled={locked || atCap}
          onClick={() => tap(g, 1)}
        >
          <span className="mirror-num">{value}</span>
          <span className="mirror-lbl">{sim ? 'ťukni = set' : 'ťukni = gól'}</span>
        </button>
        {editing && !disabled && (
          <button type="button" className="mirror-minus" aria-label={`Ubrat ${sim ? 'set' : 'gól'} ${word}`} disabled={(s[g] ?? 0) <= 0} onClick={() => onBump(g, -1)}>
            −1 {sim ? 'set' : 'gól'}
          </button>
        )}
        {m.trackLosses && (
          <>
            <button
              type="button"
              className="mirror-loss"
              aria-label={`Ztráta ${word} (${nm(ids)}), ${s[l] ?? 0}`}
              disabled={locked}
              onClick={() => tap(l, 1)}
            >
              ztráta <b>{s[l] ?? 0}</b>
            </button>
            {editing && !disabled && (
              <button type="button" className="mirror-minus" aria-label={`Ubrat ztrátu ${word}`} disabled={(s[l] ?? 0) <= 0} onClick={() => onBump(l, -1)}>
                −1 ztráta
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="mirror">
      {over && (
        <p className="mirror-done" role="status">
          {sim ? 'Zápas' : 'Leg'} dohrán {shown[0]} : {shown[1]}, uloženo
        </p>
      )}
      <div className="mirror-halves">
        {half('A')}
        {half('B')}
      </div>
      {disabled ? (
        <p className="note">Zapisují hráči a rozhodčí tohoto stolu.</p>
      ) : (
        <div className="mirror-bar">
          <button type="button" className="pill" disabled={!undo.length} onClick={back}>
            ↶ Zpět
          </button>
          <button type="button" className="pill" aria-pressed={editing} onClick={() => setEditing(!editing)}>
            {editing ? 'Hotovo' : 'Opravit'}
          </button>
        </div>
      )}
    </div>
  );
}

interface DrillProps {
  players: PlayerId[];
  def: SoloMetricDef;
  values: Record<PlayerId, number | undefined>;
  names: Record<PlayerId, string>;
  canSolo(playerId: PlayerId): boolean;
  onBump(playerId: PlayerId, delta: number): void;
}

/** PRD 7.1 Cvičení: stejné zrcadlo, pole pro každého hráče skupiny; ťuknutí = +1 do jeho metriky. */
export function DrillMirror({ players, def, values, names, canSolo, onBump }: DrillProps) {
  const [undo, setUndo] = useState<PlayerId[]>([]);
  const [editing, setEditing] = useState(false);
  const anyWritable = players.some(canSolo);
  return (
    <div className="mirror">
      <div className="mirror-metric">
        <strong>{def.name}</strong> <span>{def.what}</span>
      </div>
      <div className={`mirror-halves cols-${players.length}`}>
        {players.map((p, i) => {
          const v = values[p] ?? 0;
          const can = canSolo(p);
          return (
            <div key={p} className={`mirror-half side-${i % 2 ? 'b' : 'a'}`}>
              <div className="mirror-who">
                <strong>{names[p] ?? '?'}</strong>
                <small>max {def.max}</small>
              </div>
              <button
                type="button"
                className="mirror-goal"
                aria-label={`Přičíst ${names[p] ?? '?'}, ${values[p] ?? 0} z ${def.max}`}
                disabled={!can || v >= def.max}
                onClick={() => {
                  onBump(p, 1);
                  setUndo((u) => [...u, p]);
                }}
              >
                <span className="mirror-num">{values[p] === undefined ? '–' : v}</span>
                <span className="mirror-lbl">ťukni = +1</span>
              </button>
              {editing && can && (
                <button type="button" className="mirror-minus" aria-label={`Ubrat ${names[p] ?? '?'}`} disabled={v <= 0} onClick={() => onBump(p, -1)}>
                  −1
                </button>
              )}
            </div>
          );
        })}
      </div>
      {anyWritable && (
        <div className="mirror-bar">
          <button
            type="button"
            className="pill"
            disabled={!undo.length}
            onClick={() => {
              onBump(undo[undo.length - 1], -1);
              setUndo((u) => u.slice(0, -1));
            }}
          >
            ↶ Zpět
          </button>
          <button type="button" className="pill" aria-pressed={editing} onClick={() => setEditing(!editing)}>
            {editing ? 'Hotovo' : 'Opravit'}
          </button>
        </div>
      )}
    </div>
  );
}
