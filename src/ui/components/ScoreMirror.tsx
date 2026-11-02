import { useState } from 'react';
import { bumpLimit, legOver, tableScore } from '../../domain/legState';
import type { SoloMetricDef } from '../../domain/solo';
import { drillCount, type DrillValue } from '../../domain/drillTap';
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
  /** Proč je zápis zamčený (jinak „Zapisují hráči a rozhodčí…“). */
  note?: string;
}

/**
 * PRD 7.1 „Zrcadlo stolu“: levá a pravá polovina jako u stolu.
 * Ťuknutí do velkého pole = +1 gól (v simulaci set), červené pole = +1 ztráta.
 */
export function ScoreMirror({ match: m, score, names, me, disabled, onBump, note }: Props) {
  const [undo, setUndo] = useState<(keyof Score)[]>([]);
  const [editing, setEditing] = useState(false);
  const s = score ?? {};
  const sim = m.block === 'sim';
  const shown = sim ? [s.ga ?? 0, s.gb ?? 0] : tableScore(m, s);
  const { over } = legOver(m, s);
  const locked = disabled || (over && !editing);
  const nm = (ids: PlayerId[]) => ids.map((p) => names[p] ?? '?').join(' + ');

  const tap = (field: keyof Score) => {
    if ((s[field] ?? 0) >= bumpLimit(m, field)) return; // na stropu se nic nezmění – nic ani nevracet
    onBump(field, 1);
    setUndo((u) => [...u, field]);
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
          onClick={() => tap(g)}
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
              disabled={locked || (s[l] ?? 0) >= bumpLimit(m, l)}
              onClick={() => tap(l)}
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
        <p className="note">{note ?? 'Zapisují hráči a rozhodčí tohoto stolu.'}</p>
      ) : (
        <div className="mirror-bar">
          <button type="button" className="pill" disabled={!undo.length} onClick={back}>
            ↶ Zpět
          </button>
          <button
            type="button"
            className="pill"
            aria-pressed={editing}
            onClick={() => {
              setEditing(!editing);
              setUndo([]); // ruční opravy Zpět nesleduje – po nich by vracel víc, než bylo ťuknuto
            }}
          >
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
  values: Record<PlayerId, DrillValue | undefined>;
  names: Record<PlayerId, string>;
  canSolo(playerId: PlayerId): boolean;
  /** Pokus: ok = ✓, delta −1 = vrácení. */
  onTap(playerId: PlayerId, ok: boolean, delta: 1 | -1): void;
}

/**
 * PRD 5.8 Cvičení: po každém pokusu ✓ / ✗, appka počítá pokusy i výsledek;
 * po posledním pokusu „Hotovo“. Pole pro každého hráče skupiny (i trojice).
 */
export function DrillMirror({ players, def, values, names, canSolo, onTap }: DrillProps) {
  const [undo, setUndo] = useState<{ p: PlayerId; ok: boolean }[]>([]);
  const [editing, setEditing] = useState(false);
  const anyWritable = players.some(canSolo);
  const unit = def.lowerIsBetter ? 'ztrát' : def.ok === 'gól' ? 'gólů' : 'povedených';
  return (
    <div className="mirror drill">
      <div className="mirror-metric">
        <strong>{def.name}</strong> <span>{def.what}</span>
      </div>
      <div className={`mirror-halves cols-${players.length}`}>
        {players.map((p, i) => {
          const c = drillCount(values[p] ?? {}, def);
          const can = canSolo(p);
          const nm = names[p] ?? '?';
          const tap = (ok: boolean) => {
            onTap(p, ok, 1);
            setUndo((u) => [...u, { p, ok }]);
          };
          return (
            <div key={p} role="group" aria-label={nm} className={`mirror-half side-${i % 2 ? 'b' : 'a'}`}>
              <div className="mirror-who">
                <strong>{nm}</strong>
                <small>
                  pokus {c.attempts} / {def.max}
                </small>
              </div>
              <div className="drill-bar" aria-hidden="true">
                <i style={{ width: `${(100 * c.attempts) / def.max}%` }} />
              </div>
              <div className="drill-value">
                <span className="mirror-num">{values[p]?.value === undefined ? '–' : c.value}</span>
                <small>{unit}</small>
              </div>
              {c.done ? (
                <div className="drill-done">
                  Hotovo {c.value} z {def.max}
                </div>
              ) : (
                <>
                  <button type="button" className="drill-ok" aria-label={`${def.ok}: ${nm}`} disabled={!can} onClick={() => tap(true)}>
                    ✓ {def.ok}
                  </button>
                  <button type="button" className="drill-fail" aria-label={`${def.fail}: ${nm}`} disabled={!can} onClick={() => tap(false)}>
                    ✗ {def.fail}
                  </button>
                </>
              )}
              {editing && can && (
                <div className="drill-fix">
                  <button type="button" className="mirror-minus" aria-label={`Ubrat ${def.ok}: ${nm}`} disabled={c.hits <= 0} onClick={() => onTap(p, true, -1)}>
                    −✓
                  </button>
                  <button type="button" className="mirror-minus" aria-label={`Ubrat ${def.fail}: ${nm}`} disabled={c.misses <= 0} onClick={() => onTap(p, false, -1)}>
                    −✗
                  </button>
                </div>
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
              const last = undo[undo.length - 1];
              onTap(last.p, last.ok, -1);
              setUndo((u) => u.slice(0, -1));
            }}
          >
            ↶ Zpět
          </button>
          <button
            type="button"
            className="pill"
            aria-pressed={editing}
            onClick={() => {
              setEditing(!editing);
              setUndo([]);
            }}
          >
            {editing ? 'Hotovo' : 'Opravit'}
          </button>
        </div>
      )}
    </div>
  );
}
