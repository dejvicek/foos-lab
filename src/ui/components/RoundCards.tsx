import { Fragment, useState, type ReactNode } from 'react';
import { clockAt } from '../../domain/solo';
import type { Match, MatchId, PlayerId, Schedule, Score, SoloKey, Training } from '../../domain/types';
import { flatRows, rowKey } from '../now';
import { railClass, railLine, type RoundStatus } from '../roundState';
import { collapsedDone, finishedBySolo, finishedByScore, placeOf, roundNumbers, rowFormat, rowMinutes, keepLast, rowName, rowSub, takesPart, upcomingRounds } from '../scheduleView';
import { plural } from '../format';
import { BlockEntry, hasProgress, ItemProgress } from './BlockEntry';
import { ProgressToggle } from './ProgressToggle';
import { EditToggle } from './EditToggle';
import { TableNo } from './TableNo';
import { drillItemId } from '../../domain/queue';
import { CompactCell, Names, RailNode, soloProgress, type BreakControls } from './TrainingTable';
import { BREAK_OPTIONS } from '../../domain/breaks';

interface Props {
  schedule: Schedule;
  training: Training;
  names: Record<PlayerId, string>;
  /** Stav kol podle skutečnosti (null = trénink nezačal). */
  rounds?: Map<string, RoundStatus> | null;
  /** Ovládání pauzy v jejím řádku (Zahájit pauzu / Spustit další kolo / odpočet). */
  pauseSlots?: Map<string, ReactNode>;
  /** Admin / organizátor: rozbalený zápis kola. */
  expanded: string | null;
  onToggle(key: string): void;
  onScore(id: MatchId, s: Score): void;
  onSolo(playerId: PlayerId, key: SoloKey, value: number | null): void;
  canMatch(m: Match): boolean;
  canSolo(group: PlayerId[], playerId: PlayerId): boolean;
  breaks?: BreakControls;
  /** Panel „Týmy pro simulaci“ – u sekce simulace. */
  simSetup?: ReactNode;
  me?: PlayerId | null;
  manage?: boolean;
  running?: boolean;
  autoEnd?(itemId: string): void;
}

/**
 * PRD 7.1: celý rozpis na telefonu (18. 11. 2026): dlaždice kola ukazuje jen řádek, kde jsem (můj stůl,
 * rozhodčí, nebo Volno); ťuknutím se objeví ostatní stoly – že jich je víc, naznačují karty vykukující
 * pod dlaždicí. Kola s mou účastí mají zlatý pruh. Zapisuje se v Moje hry; admin / organizátor tady
 * rozbalí kolo („zapsat“) a zapíše celkový výsledek.
 */
export function RoundCards({ schedule: s, training, names, rounds = null, pauseSlots, expanded, onToggle, onScore, onSolo, canMatch, canSolo, breaks, simSetup, me = null, manage = false, running = false, autoEnd }: Props) {
  const order = flatRows(s).map(rowKey);
  const rail = rounds ?? upcomingRounds(s);
  const numbers = roundNumbers(s);
  const minutes = rowMinutes(s, training.format === 'custom' ? training.durationMin : undefined);
  // Otevřený Průběh stolu: `${klíč řádku}|${stůl}` (ikonka grafu, 18. 11. 2026).
  const [prog, setProg] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const folded = collapsedDone(s, rounds, running);
  const doneRounds = [...folded].filter((k) => numbers.has(k)).length;
  return (
    <div className="round-cards has-rail" aria-label="Rozpis tréninku">
      {folded.size > 0 && (
        <div className="rail st-done rb rail-first done-fold">
          <RailNode st={{ state: 'done', done: 0, total: 0, cells: [] }} label="Odehraná kola" />
          <button type="button" className="fold-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            Odehráno {doneRounds} {plural(doneRounds, 'kolo', 'kola', 'kol')}
            <span>{showDone ? 'skrýt' : 'zobrazit'}</span>
          </button>
        </div>
      )}
      {s.sections.map((sec, si) => {
        const rows = sec.rows
          .map((row, ri) => ({ row, key: rowKey({ section: si, row: ri }) }))
          .filter((x) => !(!showDone && folded.has(x.key)));
        if (!rows.length) return null;
        const line = railLine(rail, order, order.indexOf(rows[0].key) - 1);
        return (
          <Fragment key={`${sec.id}-${si}`}>
            <h3 className={['round-sec', line].filter(Boolean).join(' ')}>
              {sec.title}
              {sec.subtitle && <span> – {sec.subtitle}</span>}
            </h3>
            {sec.id === 'sim' && simSetup && <div className={line || undefined}>{simSetup}</div>}
            {sec.id === 'sim' && s.teams && (
              <p className={['note', line].filter(Boolean).join(' ')}>
                Tým A: <Names ids={s.teams.A} names={names} me={me} sep=", " />. Tým B: <Names ids={s.teams.B} names={names} me={me} sep=", " />.
              </p>
            )}
            {rows.map(({ row, key }) => {
              const time = clockAt(training.startTime, row.time);
              const bi = row.breakIndex;
              const idx = order.indexOf(key);
              const state = railClass(rail, order, idx);
              const rs = rail.get(key);
              const min = minutes.get(key);
              if (row.kind === 'break') {
                const editable = breaks && bi !== undefined && breaks.list[bi];
                return (
                  <div key={key} className={['round-break', row.label === 'Pauza' ? 'pause' : '', editable ? 'editable' : '', state].filter(Boolean).join(' ')}>
                    {row.label === 'Pauza' ? <RailNode st={rs} pause /> : <RailNode st={rs} label={row.label} />}
                    {/* Čas vlevo, název uprostřed, délka vpravo – jako hlavička ostatních karet (19. 11. 2026). */}
                    <span className="rb-top">
                      <span className="rb-time">{time}</span>
                      <span className="rb-name">{row.label}</span>
                      <span className="rb-min">
                        {editable ? (
                          // Délka pauzy vpravo – na místě délky u hráče (19. 11. 2026).
                          <select aria-label="Délka pauzy" value={breaks!.list[bi!].min} onChange={(e) => breaks!.setMin(bi!, Number(e.target.value))}>
                            {BREAK_OPTIONS.map((m) => (
                              <option key={m} value={m}>
                                {m} min
                              </option>
                            ))}
                          </select>
                        ) : min && row.label === 'Pauza' ? (
                          `${min} min`
                        ) : (
                          ''
                        )}
                      </span>
                    </span>
                    {editable && breaks!.movable(bi!) && (
                      <span className="rb-edit">
                        <button type="button" className="icon" aria-label="Pauzu o kolo dřív" disabled={!breaks!.canStep(bi!, -1)} onClick={() => breaks!.step(bi!, -1)}>
                          ↑
                        </button>
                        <button type="button" className="icon" aria-label="Pauzu o kolo později" disabled={!breaks!.canStep(bi!, 1)} onClick={() => breaks!.step(bi!, 1)}>
                          ↓
                        </button>
                        <button type="button" className="link" aria-label="Odebrat pauzu" onClick={() => breaks!.remove(bi!)}>
                          odebrat
                        </button>
                      </span>
                    )}
                    {pauseSlots?.get(key) && <div className="rb-slot">{pauseSlots.get(key)}</div>}
                  </div>
                );
              }
              const place = placeOf(row, me);
              // Řádky stolů a Volno (všechny, 19. 11. 2026). Volné stoly se neukazují.
              const lines = [
                ...row.cells.flatMap((c, j) => {
                  if (!c) return [];
                  const id = c.type === 'match' ? c.match.id : drillItemId(row, j + 1, c.players);
                  const has = hasProgress(training, id, c.type === 'match' ? c.match : undefined);
                  const pk = `${key}|${j}`;
                  return [{
                    node: (
                      <div key={j} className="tile-line">
                        <span className="tile-row">
                          <TableNo n={j + 1} mine={takesPart(place) && 'table' in place && place.table === j + 1} />
                          <span>
                            <CompactCell cell={c} t={training} names={names} me={me} roundName={rowName(row, sec.id)} />
                          </span>
                          {/* Vždy (i prázdné): sloupec ikonek má v celé kartě stejnou šířku, skóre zůstane pod sebou. */}
                          <span className="cell-ics">
                            {has && <ProgressToggle open={prog === pk} onToggle={() => setProg(prog === pk ? null : pk)} label={`${row.label}, stůl ${j + 1}`} />}
                            {manage && <EditToggle open={expanded === pk} done={rs?.cells[j] === 'done'} label={`${row.label}, stůl ${j + 1}`} onToggle={() => onToggle(pk)} />}
                          </span>
                        </span>
                        {manage && expanded === pk && (
                          <div className="tile-entry">
                            <BlockEntry
                              row={row}
                              waitingLabel={sec.waitingLabel}
                              training={training}
                              names={names}
                              onScore={(id, sc) => {
                                onScore(id, sc);
                                const done = finishedByScore(row, training.scores, id, sc);
                                if (done) autoEnd?.(done);
                              }}
                              onSolo={(p, k, v) => {
                                onSolo(p, k, v);
                                const done = finishedBySolo(row, training, p, k, v);
                                if (done) autoEnd?.(done);
                              }}
                              canMatch={canMatch}
                              canSolo={canSolo}
                              only={j}
                            />
                          </div>
                        )}
                        {has && prog === pk && c && (
                          <div>
                            <ItemProgress
                              itemId={id}
                              match={c.type === 'match' ? c.match : undefined}
                              players={c.type === 'match' ? [...c.match.sideA, ...c.match.sideB] : c.players}
                              training={training}
                              names={names}
                            />
                          </div>
                        )}
                      </div>
                    ),
                  }];
                }),
                ...(row.waiting.length
                  ? [
                      {
                        node: (
                          <div key="free" className="tile-line">
                            <span className="tile-row">
                              <b>Volno</b>
                              <span>
                                <Names ids={row.waiting} names={names} me={me} sep=", " />
                              </span>
                            </span>
                          </div>
                        ),
                      },
                    ]
                  : []),
              ];
              const progress = manage ? soloProgress(row, training) : null;
              return (
                // Všechny stoly vždy (19. 11. 2026, *rozhodnutí uživatele*) – dlaždice se nerozbaluje.
                <article
                  key={key}
                  className={['round-card', state, takesPart(place) ? 'mine-row' : ''].filter(Boolean).join(' ')}
                  aria-label={`${row.label}, ${rowName(row, sec.id)}, ${time}`}
                >
                  <RailNode st={rs} no={numbers.get(key)} />
                  <div className="tile-head">
                    {/* Čas vlevo, název uprostřed, formát vpravo (19. 11. 2026). */}
                    <span className="tile-top">
                      <span className="tile-time">{time}</span>
                      <span className="tile-name">{keepLast(rowName(row, sec.id))}</span>
                      <span className="tile-fmt" title={rowFormat(row) ?? undefined}>
                        {rowFormat(row, true)}
                      </span>
                    </span>
                    {rowSub(min, row, progress, false) && <span className="tile-sub">{rowSub(min, row, progress, false)}</span>}
                  </div>
                  {/* Řádky stolů a Volno; ikonka grafu otevře Průběh, tužka zápis stolu. */}
                  <div className="tile-rows">{lines.map((x) => x.node)}</div>
                </article>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}
