import { Fragment } from 'react';
import { clockAt, soloKey } from '../../domain/solo';
import type { Cell, Match, MatchId, PlayerId, Schedule, ScheduleRow, Score, SoloKey, Training } from '../../domain/types';
import { flatRows, rowKey, type RowRef } from '../now';
import { BlockEntry } from './BlockEntry';

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
}

function CompactCell({ cell, t, names }: { cell: Cell; t: Training; names: Record<PlayerId, string> }) {
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

function soloProgress(row: ScheduleRow, t: Training): string | null {
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

export function TrainingTable({ schedule: s, training, names, current, expanded, onToggle, onScore, onSolo, canMatch, canSolo }: Props) {
  const order = flatRows(s).map(rowKey);
  const curIdx = current ? order.indexOf(rowKey(current)) : -1;
  const cols = s.tables + 3;
  return (
    <div className="plan-wrap">
      <table className="plan" aria-label="Rozpis tréninku">
        <thead>
          <tr>
            <th className="c-time">Čas</th>
            <th className="c-block">Blok</th>
            {Array.from({ length: s.tables }, (_, j) => (
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
                return (
                  <Fragment key={key}>
                    <tr
                      className={[state, row.kind, open ? 'open' : ''].filter(Boolean).join(' ')}
                      onClick={canOpen ? () => onToggle(key) : undefined}
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
                        <td colSpan={s.tables + 1} />
                      ) : (
                        <>
                          {row.cells.map((c, j) => (
                            <td key={j} className={c ? undefined : 'free'}>
                              {c ? <CompactCell cell={c} t={training} names={names} /> : 'volný'}
                            </td>
                          ))}
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
