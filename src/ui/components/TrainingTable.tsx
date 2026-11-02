import { Fragment, useState, type DragEvent } from 'react';
import { BREAK_OPTIONS } from '../../domain/breaks';
import { clockAt, soloKey } from '../../domain/solo';
import type { BreakDef, Cell, Match, MatchId, PlayerId, Schedule, ScheduleRow, Score, SoloKey, Training } from '../../domain/types';
import { flatRows, rowKey, type RowRef } from '../now';
import { BlockEntry } from './BlockEntry';
import type { ItemTiming } from './Timing';

interface Props {
  schedule: Schedule;
  training: Training;
  names: Record<PlayerId, string>;
  current: RowRef | null;
  expanded: string | null;
  onToggle(key: string): void;
  onScore(id: MatchId, s: Score): void;
  onSolo(playerId: PlayerId, key: SoloKey, value: number | null): void;
  canMatch?(m: Match): boolean;
  canSolo?(group: PlayerId[], playerId: PlayerId): boolean;
  /** Správce konfigurovatelného tréninku: úpravy pauz. */
  breaks?: BreakControls;
  timing?: ItemTiming;
}

/** Úpravy pauz (počet, místo, délka) – jen správce konfigurovatelného tréninku. */
export interface BreakControls {
  list: BreakDef[];
  /** Pauza mezi odehranými koly se nehýbe a neodebírá. */
  movable(i: number): boolean;
  canMoveTo(i: number, after: number): boolean;
  move(i: number, after: number): void;
  /** Posun o jedno volné místo dřív / později (šipky, klávesnice). */
  step(i: number, dir: -1 | 1): void;
  canStep(i: number, dir: -1 | 1): boolean;
  setMin(i: number, min: number): void;
  remove(i: number): void;
}

/** Stoly, u kterých v rozpisu něco je (prázdné sloupce se nezobrazují). */
export const usedTables = (s: Schedule): number[] =>
  Array.from({ length: s.tables }, (_, j) => j).filter((j) => s.sections.some((sec) => sec.rows.some((r) => r.cells[j])));

/** Ovládání pauzy v řádku: úchyt, délka, odebrání. */
export function BreakEditor({ i, c }: { i: number; c: BreakControls }) {
  const b = c.list[i];
  const movable = c.movable(i);
  return (
    <span className="break-edit">
      {movable && (
        <span
          className="drag-handle"
          role="button"
          tabIndex={0}
          aria-label="Přesunout pauzu"
          title="Přetáhni mezi jiná kola (nebo šipky nahoru / dolů)"
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              c.step(i, e.key === 'ArrowUp' ? -1 : 1);
            }
          }}
        >
          ⠿
        </span>
      )}
      <span className="row-label">Pauza</span>
      <select aria-label="Délka pauzy" value={b.min} onChange={(e) => c.setMin(i, Number(e.target.value))}>
        {BREAK_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m} min
          </option>
        ))}
      </select>
      {movable && (
        <button type="button" className="link" aria-label="Odebrat pauzu" onClick={() => c.remove(i)}>
          odebrat
        </button>
      )}
    </span>
  );
}

export function CompactCell({ cell, t, names }: { cell: Cell; t: Training; names: Record<PlayerId, string> }) {
  const nm = (ids: PlayerId[]) => ids.map((id) => names[id] ?? '?').join(' + ');
  if (cell.type === 'group') {
    return (
      <>
        <span className="cell-names">{cell.players.map((p) => names[p] ?? '?').join(', ')}</span>
        {cell.station && <span className="cell-sub">{cell.station}</span>}
      </>
    );
  }
  const m = cell.match;
  const s = t.scores[m.id];
  const has = s && s.ga !== undefined && s.ga !== null && s.gb !== undefined && s.gb !== null;
  const st = m.start ?? [0, 0];
  const wallSide = m.wall === 'A' ? m.sideA : m.wall === 'B' ? m.sideB : null;
  return (
    <>
      <span className="cell-names">
        {nm(m.sideA)} <span className="vs">vs</span> {nm(m.sideB)}
      </span>
      {wallSide && <span className="cell-sub">Zeď: {nm(wallSide)}</span>}
      <span className={has ? 'cell-score' : 'cell-score empty'}>
        {has ? `${s!.ga! + st[0]}:${s!.gb! + st[1]}` : m.start ? `${st[0]}:${st[1]} start` : '–:–'}
      </span>
      {has && m.start && (
        <span className="cell-sub">
          odehráno {s!.ga}:{s!.gb}
        </span>
      )}
    </>
  );
}

export function soloProgress(row: ScheduleRow, t: Training): string | null {
  let total = 0;
  let done = 0;
  for (const c of row.cells)
    if (c?.type === 'group' && c.metric)
      for (const p of c.players) {
        total++;
        if (t.soloResults[p]?.[soloKey(c.metric, c.soloRound)] !== undefined) done++;
      }
  return total ? `zapsáno ${done} z ${total}` : null;
}

export function TrainingTable({ schedule: s, training, names, current, expanded, onToggle, onScore, onSolo, canMatch, canSolo, breaks, timing }: Props) {
  const order = flatRows(s).map(rowKey);
  const curIdx = current ? order.indexOf(rowKey(current)) : -1;
  const visible = usedTables(s);
  const cols = visible.length + 3;
  // Přetahování pauzy: která pauza se táhne a před / za které kolo by spadla.
  const [dragging, setDragging] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ key: string; pos: 'before' | 'after'; after: number } | null>(null);
  const dropAt = (e: DragEvent<HTMLTableRowElement>, key: string, roundNo: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    const pos = e.clientY > r.top + r.height / 2 ? 'after' : 'before';
    return { key, pos, after: pos === 'after' ? roundNo : roundNo - 1 } as const;
  };
  return (
    <div className="plan-wrap">
      <table className="plan" aria-label="Rozpis tréninku">
        <thead>
          <tr>
            <th className="c-time">Čas</th>
            <th className="c-block">Blok</th>
            {visible.map((j) => (
              <th key={j}>Stůl {j + 1}</th>
            ))}
            <th className="c-wait">Mimo stůl</th>
          </tr>
        </thead>
        <tbody>
          {s.sections.map((sec, si) => (
            <Fragment key={`${sec.id}-${si}`}>
              <tr className="section-row">
                <th colSpan={cols} scope="colgroup">
                  {sec.title}
                  {sec.subtitle && <span> – {sec.subtitle}</span>}
                  {sec.id === 'sim' && s.teams && (
                    <span className="sec-teams">
                      <span>
                        Tým A: {s.teams.A.map((p) => names[p] ?? '?').join(', ')}. Tým B:{' '}
                        {s.teams.B.map((p) => names[p] ?? '?').join(', ')}.
                      </span>
                      <span className="sec-lock">
                        {training.simSplit === 'manual'
                          ? ' Sestaveno ručně.'
                          : training.simTeams
                          ? ' Týmy jsou zamčené (už je zapsaný výsledek simulace).'
                          : training.simSplit === 'performance'
                            ? ' Vyrovnaně podle výkonu ve scénářové lize; zamknou se prvním výsledkem simulace.'
                            : ' Podle nominačního pořadí.'}
                      </span>
                    </span>
                  )}
                </th>
              </tr>
              {sec.rows.map((row, ri) => {
                const key = rowKey({ section: si, row: ri });
                const idx = order.indexOf(key);
                const state = curIdx < 0 ? '' : idx < curIdx ? 'past' : idx === curIdx ? 'current' : '';
                const open = expanded === key;
                const canOpen = row.kind !== 'break';
                const progress = soloProgress(row, training);
                const bi = row.breakIndex;
                if (breaks && bi !== undefined && breaks.list[bi])
                  return (
                    <tr
                      key={key}
                      className={['break', 'break-row', state, dragging === bi ? 'dragging' : ''].filter(Boolean).join(' ')}
                      draggable={breaks.movable(bi)}
                      onDragStart={(e) => {
                        e.dataTransfer?.setData?.('text/plain', 'pauza');
                        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                        setDragging(bi);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setDrop(null);
                      }}
                    >
                      <td className="c-time">{clockAt(training.startTime, row.time)}</td>
                      <td colSpan={visible.length + 2}>
                        <BreakEditor i={bi} c={breaks} />
                      </td>
                    </tr>
                  );
                const droppable = dragging !== null && !!breaks && row.roundNo !== undefined;
                return (
                  <Fragment key={key}>
                    <tr
                      className={[state, row.kind, open ? 'open' : '', drop?.key === key ? `drop-${drop.pos}` : ''].filter(Boolean).join(' ')}
                      onClick={canOpen ? () => onToggle(key) : undefined}
                      onDragOver={
                        droppable
                          ? (e) => {
                              const d = dropAt(e, key, row.roundNo!);
                              if (!breaks!.canMoveTo(dragging!, d.after)) return setDrop(null);
                              e.preventDefault();
                              if (drop?.key !== d.key || drop.pos !== d.pos) setDrop(d);
                            }
                          : undefined
                      }
                      onDrop={
                        droppable
                          ? (e) => {
                              e.preventDefault();
                              const d = dropAt(e, key, row.roundNo!);
                              if (breaks!.canMoveTo(dragging!, d.after)) breaks!.move(dragging!, d.after);
                              setDragging(null);
                              setDrop(null);
                            }
                          : undefined
                      }
                    >
                      <td className="c-time">{clockAt(training.startTime, row.time)}</td>
                      <td className="c-block">
                        {canOpen ? (
                          <button
                            type="button"
                            className="row-toggle"
                            aria-expanded={open}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggle(key);
                            }}
                          >
                            {row.label}
                          </button>
                        ) : (
                          <span className="row-label">{row.label}</span>
                        )}
                        {row.rule && <span className="cell-sub">{row.rule}</span>}
                        {progress && <span className="cell-sub">{progress}</span>}
                      </td>
                      {row.kind === 'break' ? (
                        <td colSpan={visible.length + 1} />
                      ) : (
                        <>
                          {visible.map((j) => {
                            const c = row.cells[j];
                            return (
                              <td key={j} className={c ? undefined : 'free'}>
                                {c ? <CompactCell cell={c} t={training} names={names} /> : 'volný'}
                              </td>
                            );
                          })}
                          <td className="c-wait">{row.waiting.length ? row.waiting.map((p) => names[p] ?? '?').join(', ') : '–'}</td>
                        </>
                      )}
                    </tr>
                    {open && (
                      <tr className="expand">
                        <td colSpan={cols}>
                          <BlockEntry
                            row={row}
                            waitingLabel={sec.waitingLabel}
                            training={training}
                            names={names}
                            onScore={onScore}
                            onSolo={onSolo}
                            canMatch={canMatch}
                            canSolo={canSolo}
                            timing={timing}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
