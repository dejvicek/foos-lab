import { Fragment, useState, type ReactNode } from 'react';
import { legOver } from '../../domain/legState';
import { clockAt } from '../../domain/solo';
import type { Cell, Match, PlayerId, Schedule, ScheduleRow, Training } from '../../domain/types';
import { flatRows, rowKey, type RowRef } from '../now';
import { BlockEntry, type TapEntry } from './BlockEntry';
import type { ItemTiming } from './Timing';
import { CompactCell, soloProgress, type BreakControls } from './TrainingTable';
import { BREAK_OPTIONS } from '../../domain/breaks';

interface Props {
  schedule: Schedule;
  training: Training;
  names: Record<PlayerId, string>;
  current: RowRef | null;
  expanded: string | null;
  onToggle(key: string): void;
  canMatch(m: Match): boolean;
  canSolo(group: PlayerId[], playerId: PlayerId): boolean;
  tap: TapEntry;
  breaks?: BreakControls;
  timing?: ItemTiming;
  /** Panel „Týmy pro simulaci“ – u sekce simulace. */
  simSetup?: ReactNode;
}

/** Dohraný zápas: leg skončil (ťukání), nebo je zapsaný ručně z notebooku. */
const scored = (t: Training, m: Match) => legOver(m, t.scores[m.id]).over;

function isMine(c: Cell | null, me: PlayerId | null): boolean {
  if (!c || !me) return false;
  if (c.type === 'group') return c.players.includes(me);
  return [...c.match.sideA, ...c.match.sideB].includes(me) || c.match.referee === me;
}

function status(row: ScheduleRow, t: Training): string | null {
  const matches = row.cells.flatMap((c) => (c?.type === 'match' ? [c.match] : []));
  if (matches.length) {
    const done = matches.filter((m) => scored(t, m)).length;
    return `${done}/${matches.length}${done === matches.length ? ' ✓' : ''}`;
  }
  return soloProgress(row, t);
}

/** PRD 7.1: celý rozpis na telefonu jako karty kol; ťuknutí na stůl otevře zrcadlo stolu. */
export function RoundCards({ schedule: s, training, names, current, expanded, onToggle, canMatch, canSolo, tap, breaks, timing, simSetup }: Props) {
  const order = flatRows(s).map(rowKey);
  const curIdx = current ? order.indexOf(rowKey(current)) : -1;
  const [picked, setPicked] = useState<Record<string, number | null>>({});
  return (
    <div className="round-cards" aria-label="Rozpis tréninku">
      {s.sections.map((sec, si) => (
        <Fragment key={`${sec.id}-${si}`}>
          <h3 className="round-sec">
            {sec.title}
            {sec.subtitle && <span> – {sec.subtitle}</span>}
          </h3>
          {sec.id === 'sim' && simSetup}
          {sec.id === 'sim' && s.teams && (
            <p className="note">
              Tým A: {s.teams.A.map((p) => names[p] ?? '?').join(', ')}. Tým B: {s.teams.B.map((p) => names[p] ?? '?').join(', ')}.
            </p>
          )}
          {sec.rows.map((row, ri) => {
            const key = rowKey({ section: si, row: ri });
            const time = clockAt(training.startTime, row.time);
            const bi = row.breakIndex;
            if (breaks && bi !== undefined && breaks.list[bi])
              return (
                <div key={key} className="round-break editable">
                  <span>{time} Pauza</span>
                  <select aria-label="Délka pauzy" value={breaks.list[bi].min} onChange={(e) => breaks.setMin(bi, Number(e.target.value))}>
                    {BREAK_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                  {breaks.movable(bi) && (
                    <>
                      <button type="button" className="icon" aria-label="Pauzu o kolo dřív" disabled={!breaks.canStep(bi, -1)} onClick={() => breaks.step(bi, -1)}>
                        ↑
                      </button>
                      <button type="button" className="icon" aria-label="Pauzu o kolo později" disabled={!breaks.canStep(bi, 1)} onClick={() => breaks.step(bi, 1)}>
                        ↓
                      </button>
                      <button type="button" className="link" aria-label="Odebrat pauzu" onClick={() => breaks.remove(bi)}>
                        odebrat
                      </button>
                    </>
                  )}
                </div>
              );
            if (row.kind === 'break')
              return (
                <p key={key} className="round-break">
                  {time} {row.label}
                </p>
              );
            const idx = order.indexOf(key);
            const state = curIdx < 0 ? '' : idx < curIdx ? 'past' : idx === curIdx ? 'current' : '';
            const open = expanded === key;
            const mineIdx = row.cells.findIndex((c) => isMine(c, tap.me));
            const sel = key in picked ? picked[key] : mineIdx >= 0 ? mineIdx : null;
            const st = status(row, training);
            const cell = sel === null ? null : row.cells[sel];
            return (
              <article key={key} className={['round-card', state, open ? 'open' : ''].filter(Boolean).join(' ')}>
                <button type="button" className="round-head" aria-expanded={open} onClick={() => onToggle(key)}>
                  <span className="round-time">{time}</span>{' '}
                  <span className="round-name">
                    {row.label}
                    {state === 'current' && ' – teď'}
                    {row.rule && <small> {row.rule}</small>}
                  </span>{' '}
                  <span className="round-st">{st ?? (open ? '▾' : '▸')}</span>
                </button>
                {open && (
                  <div className="round-body">
                    <div className="round-tables">
                      {row.cells.map((c, j) =>
                        c ? (
                          <button
                            key={j}
                            type="button"
                            className={['round-table', isMine(c, tap.me) ? 'mine' : '', sel === j ? 'sel' : ''].filter(Boolean).join(' ')}
                            aria-pressed={sel === j}
                            onClick={() => setPicked({ ...picked, [key]: sel === j ? null : j })}
                          >
                            <span className="round-tno">Stůl {j + 1}</span>{' '}
                            <span className="round-tcell">
                              <CompactCell cell={c} t={training} names={names} />
                            </span>
                          </button>
                        ) : null,
                      )}
                    </div>
                    {row.waiting.length > 0 && (
                      <p className="note">
                        {sec.waitingLabel}: {row.waiting.map((p) => names[p] ?? '?').join(', ')}
                      </p>
                    )}
                    {cell && (
                      <BlockEntry
                        row={{ ...row, cells: row.cells.map((c, j) => (j === sel ? c : null)), waiting: [] }}
                        waitingLabel={sec.waitingLabel}
                        training={training}
                        names={names}
                        onScore={() => {}}
                        onSolo={() => {}}
                        canMatch={canMatch}
                        canSolo={canSolo}
                        tap={tap}
                        timing={timing}
                      />
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
