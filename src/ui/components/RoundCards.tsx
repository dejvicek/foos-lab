import { Fragment, useState, type ReactNode } from 'react';
import { clockAt } from '../../domain/solo';
import type { Match, MatchId, PlayerId, Schedule, Score, SoloKey, Training } from '../../domain/types';
import { flatRows, rowKey } from '../now';
import { railClass, railLine, type RoundStatus } from '../roundState';
import { collapsedDone, finishedBySolo, finishedByScore, placeOf, roundNumbers, rowMinutes, rowName, takesPart, upcomingRounds } from '../scheduleView';
import { plural } from '../format';
import { BlockEntry, hasProgress, ItemProgress } from './BlockEntry';
import { ProgressToggle } from './ProgressToggle';
import { EditToggle } from './EditToggle';
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
  const [tiles, setTiles] = useState<Record<string, boolean>>({});
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
                    <span className="rb-name">
                      {row.label}
                      {!editable && min && row.label === 'Pauza' ? ` ${min} min` : ''}
                    </span>
                    {editable && (
                      <span className="rb-edit">
                        <select aria-label="Délka pauzy" value={breaks!.list[bi!].min} onChange={(e) => breaks!.setMin(bi!, Number(e.target.value))}>
                          {BREAK_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                              {m} min
                            </option>
                          ))}
                        </select>
                        {breaks!.movable(bi!) && (
                          <>
                            <button type="button" className="icon" aria-label="Pauzu o kolo dřív" disabled={!breaks!.canStep(bi!, -1)} onClick={() => breaks!.step(bi!, -1)}>
                              ↑
                            </button>
                            <button type="button" className="icon" aria-label="Pauzu o kolo později" disabled={!breaks!.canStep(bi!, 1)} onClick={() => breaks!.step(bi!, 1)}>
                              ↓
                            </button>
                            <button type="button" className="link" aria-label="Odebrat pauzu" onClick={() => breaks!.remove(bi!)}>
                              odebrat
                            </button>
                          </>
                        )}
                      </span>
                    )}
                    <span className="rb-time">{time}</span>
                    {pauseSlots?.get(key) && <div className="rb-slot">{pauseSlots.get(key)}</div>}
                  </div>
                );
              }
              const place = placeOf(row, me);
              // Řádky stolů a Volno; sbalená dlaždice ukazuje jen ten, kde jsem.
              const lines = [
                ...row.cells.map((c, j) => {
                  const id = c ? (c.type === 'match' ? c.match.id : drillItemId(row, j + 1, c.players)) : '';
                  const has = !!c && hasProgress(training, id, c.type === 'match' ? c.match : undefined);
                  const pk = `${key}|${j}`;
                  return {
                    mine: (place.kind === 'play' || place.kind === 'ref') && place.table === j + 1,
                    node: (
                      <div key={j} className="tile-line">
                        <span className="tile-row">
                          <b>Stůl {j + 1}</b>
                          <span>{c ? <CompactCell cell={c} t={training} names={names} me={me} /> : <span className="free">volný</span>}</span>
                          {has && <ProgressToggle open={prog === pk} onToggle={() => setProg(prog === pk ? null : pk)} label={`${row.label}, stůl ${j + 1}`} />}
                        </span>
                        {has && prog === pk && c && (
                          <div onClick={(e) => e.stopPropagation()}>
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
                  };
                }),
                ...(row.waiting.length
                  ? [
                      {
                        mine: place.kind === 'free',
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
              // Kdo v tréninku není (admin), vidí stoly hned všechny.
              const mineLines = lines.filter((x) => x.mine);
              const isOpen = tiles[key] ?? mineLines.length === 0;
              const shown = isOpen ? lines : mineLines;
              const more = lines.length > shown.length;
              const entry = manage && expanded === key;
              const progress = manage ? soloProgress(row, training) : null;
              return (
                <article key={key} className={['round-card', state, takesPart(place) ? 'mine-row' : '', more ? 'stacked' : ''].filter(Boolean).join(' ')}>
                  <RailNode st={rs} no={numbers.get(key)} />
                  <button
                    type="button"
                    className="tile-head"
                    aria-expanded={isOpen}
                    aria-label={`${row.label}, ${rowName(row, sec.id)}, ${time}: ${isOpen ? 'skrýt ostatní stoly' : 'zobrazit všechny stoly'}`}
                    onClick={() => setTiles({ ...tiles, [key]: !isOpen })}
                  >
                    <span className="tile-top">
                      <span className="tile-name">{rowName(row, sec.id)}</span>
                      <span className="tile-time">{time}</span>
                    </span>
                    {(min || progress) && (
                      <span className="tile-sub">
                        {min ? `${min} min` : ''}
                        {min && progress ? ' · ' : ''}
                        {progress}
                      </span>
                    )}
                  </button>
                  {/* Řádky stolů: ťuknutí rozbalí / sbalí dlaždici (klávesnicí přes hlavičku); ikonka grafu otevře Průběh. */}
                  <div className="tile-rows" onClick={() => setTiles({ ...tiles, [key]: !isOpen })}>
                    {shown.map((x) => x.node)}
                  </div>
                  {manage && <EditToggle open={entry} done={rs?.state === 'done'} label={row.label} onToggle={() => onToggle(key)} />}
                  {entry && (
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
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}
