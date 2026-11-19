import { Fragment, useState, type DragEvent, type ReactNode } from 'react';
import { matchState } from '../../domain/matchFormat';
import { tableScore } from '../../domain/legState';
import { isEmptyScore } from '../../domain/training';
import { BREAK_OPTIONS } from '../../domain/breaks';
import { clockAt, soloKey } from '../../domain/solo';
import type { BreakDef, Cell, Match, MatchId, PlayerId, Schedule, ScheduleRow, Score, SoloKey, Training } from '../../domain/types';
import { flatRows, rowKey } from '../now';
import { railClass, railLine, STATE_LABEL, type RoundStatus } from '../roundState';
import { collapsedDone, finishedBySolo, finishedByScore, placeOf, roundNumbers, rowFormat, rowMinutes, rowName, rowSub, takesPart, upcomingRounds } from '../scheduleView';
import { plural } from '../format';
import { BlockEntry, hasProgress, ItemProgress, type TapSolo } from './BlockEntry';
import { ProgressToggle } from './ProgressToggle';
import { EditToggle } from './EditToggle';
import { drillItemId } from '../../domain/queue';
import type { ItemTiming } from './Timing';

interface Props {
  schedule: Schedule;
  training: Training;
  names: Record<PlayerId, string>;
  /** Stav kol podle skutečnosti (null = trénink nezačal). */
  rounds?: Map<string, RoundStatus> | null;
  now?: number;
  /** Ovládání pauzy v jejím řádku (Zahájit pauzu / Spustit další kolo / odpočet). */
  pauseSlots?: Map<string, ReactNode>;
  expanded: string | null;
  onToggle(key: string): void;
  onScore(id: MatchId, s: Score): void;
  onSolo(playerId: PlayerId, key: SoloKey, value: number | null): void;
  canMatch?(m: Match): boolean;
  canSolo?(group: PlayerId[], playerId: PlayerId): boolean;
  /** Správce konfigurovatelného tréninku: úpravy pauz. */
  breaks?: BreakControls;
  timing?: ItemTiming;
  onTapSolo?: TapSolo;
  /** Panel „Týmy pro simulaci“ – zobrazí se u sekce simulace. */
  simSetup?: ReactNode;
  /** Přihlášený hráč: zlatý pruh u kol s jeho účastí a jméno tučně zlatě. */
  me?: PlayerId | null;
  /** Admin / organizátor: rozbalí kolo a zapíše celkový výsledek; hráč má rozpis jen ke čtení. */
  manage?: boolean;
  /** Trénink běží: odehraná kola se sbalí do jednoho řádku. */
  running?: boolean;
  /** Zapsaný dohraný výsledek utkání ukončí (ID utkání). */
  autoEnd?(itemId: string): void;
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

/** Jména hráčů; moje tučně zlatě (18. 11. 2026). */
export function Names({ ids, names, me, sep = ' + ' }: { ids: PlayerId[]; names: Record<PlayerId, string>; me?: PlayerId | null; sep?: string }) {
  return (
    <>
      {ids.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && sep}
          {id === me ? <b className="me-name">{names[id] ?? '?'}</b> : (names[id] ?? '?')}
        </Fragment>
      ))}
    </>
  );
}

export function CompactCell({ cell, t, names, me = null }: { cell: Cell; t: Training; names: Record<PlayerId, string>; me?: PlayerId | null }) {
  if (cell.type === 'group') {
    return (
      <>
        <span className="cell-names">
          <Names ids={cell.players} names={names} me={me} sep=", " />
        </span>
        {cell.station && <span className="cell-sub">{cell.station}</span>}
      </>
    );
  }
  return <MatchBoard m={cell.match} t={t} names={names} me={me} />;
}

/**
 * Zápas na stole jako výsledková tabule (19. 11. 2026, *rozhodnutí uživatele*, návrh A): každá strana vlastní řádek
 * s tečkou barvy strany, vedle skóre legů ve sloupcích a za čarou výsledek (legy u BO, jinak góly včetně startu).
 * Vítěz tučně, poražený výsledek šedě, rozehraný leg zlatě; pod tím drobně start, Zeď, rozhodčí, „hraje se“.
 * Rozehranost podle zahájení utkání (ne podle skóre – starší legy na čas nekončily na 6).
 */
function MatchBoard({ m, t, names, me }: { m: Match; t: Training; names: Record<PlayerId, string>; me: PlayerId | null }) {
  const pt = t.playTimes?.[m.id];
  const playing = pt?.startedAt !== undefined && pt.endedAt === undefined;
  const st = m.start ?? [0, 0];
  let legs: { a: number; b: number; win: 'A' | 'B' | null; run: boolean }[] = [];
  let tot: [number, number] | null = null;
  if ((m.bestOf ?? 1) > 1) {
    const ms = matchState(m, t.scores);
    legs = ms.legs
      .filter((l) => !isEmptyScore(l.score))
      .map((l) => {
        const [a, b] = tableScore(l.leg, l.score);
        return { a, b, win: l.winner, run: !l.over && playing };
      });
    if (legs.length) tot = [ms.legsA, ms.legsB];
  } else {
    const s = t.scores[m.id];
    if (s && s.ga !== undefined && s.ga !== null && s.gb !== undefined && s.gb !== null) tot = [s.ga + st[0], s.gb + st[1]];
  }
  const winner = tot && !playing ? (tot[0] > tot[1] ? 'A' : tot[1] > tot[0] ? 'B' : null) : null;
  const plain = (ids: PlayerId[]) => ids.map((id) => names[id] ?? '?').join(' + ');
  // Asymetrická disciplína (19. 11. 2026): štítek u dvojice, kdo hraje kterou stranu – Zeď / Láme zeď, nerovný start.
  const asymStart = !!m.start && st[0] !== st[1];
  const badge = (k: 'A' | 'B'): string | null =>
    m.wall ? (m.wall === k ? 'Zeď' : 'Láme zeď') : asymStart ? `začíná ${st[k === 'A' ? 0 : 1]}` : null;
  const side = (k: 'A' | 'B') => {
    const ids = k === 'A' ? m.sideA : m.sideB;
    const i = k === 'A' ? 0 : 1;
    const total = tot ? tot[i] : m.start && (m.bestOf ?? 1) === 1 ? st[i] : '–';
    const b = badge(k);
    return (
      <Fragment key={k}>
        <span className={winner === k ? 'mb-nm win' : 'mb-nm'} title={plain(ids)}>
          <i className={k === 'A' ? 'mb-dot a' : 'mb-dot b'} />
          <span className="mb-who">
            <Names ids={ids} names={names} me={me} />
          </span>
          {b && <span className={m.wall === k ? 'mb-badge wall' : 'mb-badge'}>{b}</span>}
        </span>
        <span className="mb-sc">
          {legs.map((l, j) => (
            <span key={j} className={l.run ? 'run' : l.win === k ? 'lw' : undefined}>
              {k === 'A' ? l.a : l.b}
            </span>
          ))}
          <b className={!tot ? 'none' : winner && winner !== k ? 'lose' : undefined}>{total}</b>
        </span>
      </Fragment>
    );
  };
  const foot: ReactNode[] = [];
  // Rovný start (4:4, 5:5) je v názvu kola i ve výsledku – pod zápasem se neopakuje (19. 11. 2026).
  if (m.referee)
    foot.push(
      <>
        rozhodčí <Names ids={[m.referee]} names={names} me={me} />
      </>,
    );
  if (playing) foot.push(<span className="mb-live">hraje se</span>);
  const label = `${plain(m.sideA)} vs ${plain(m.sideB)}${tot ? ` ${tot[0]}:${tot[1]}` : ''}`;
  return (
    <span className="mb" role="group" aria-label={label}>
      {side('A')}
      {side('B')}
      {foot.length > 0 && (
        <span className="mb-foot">
          {foot.map((f, j) => (
            <Fragment key={j}>
              {j > 0 && ' · '}
              {f}
            </Fragment>
          ))}
        </span>
      )}
    </span>
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

/** Uzel časové osy: číslo kola (odehrané ✓), pauza ❚❚, jiný řádek (zápis, sbalená kola) bez čísla. */
export function RailNode({ st, no, pause, label }: { st: RoundStatus | undefined; no?: number; pause?: boolean; label?: string }) {
  const state = st?.state ?? 'upcoming';
  const what = pause ? 'Pauza' : no ? `${no}. kolo` : (label ?? '');
  return (
    <span className={pause ? 'rail-node pause' : 'rail-node'} role="img" aria-label={`${what} – ${STATE_LABEL[state].toLowerCase()}`}>
      {pause ? (
        <>
          <i />
          <i />
        </>
      ) : state === 'done' ? (
        '✓'
      ) : (
        (no ?? '')
      )}
    </span>
  );
}

export function TrainingTable({ schedule: s, training, names, rounds = null, pauseSlots, expanded, onToggle, onScore, onSolo, canMatch, canSolo, breaks, simSetup, me = null, manage = false, running = false, autoEnd }: Props) {
  const order = flatRows(s).map(rowKey);
  const visible = usedTables(s);
  const cols = visible.length + 3;
  // Osa s čísly kol je vidět vždy; před začátkem tréninku všechno „bude se hrát“.
  const rail = rounds ?? upcomingRounds(s);
  const numbers = roundNumbers(s);
  const minutes = rowMinutes(s, training.format === 'custom' ? training.durationMin : undefined);
  const [showDone, setShowDone] = useState(false);
  // Otevřený Průběh stolu: `${klíč řádku}|${stůl}` (ikonka grafu, 18. 11. 2026).
  const [prog, setProg] = useState<string | null>(null);
  const folded = collapsedDone(s, rounds, running);
  const doneRounds = [...folded].filter((k) => numbers.has(k)).length;
  const hidden = (key: string) => !showDone && folded.has(key);
  // Přetahování pauzy: která pauza se táhne a před / za které kolo by spadla.
  const [dragging, setDragging] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ key: string; pos: 'before' | 'after'; after: number } | null>(null);
  const dropAt = (e: DragEvent<HTMLTableRowElement>, key: string, roundNo: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    const pos = e.clientY > r.top + r.height / 2 ? 'after' : 'before';
    return { key, pos, after: pos === 'after' ? roundNo : roundNo - 1 } as const;
  };
  const shownRow = (_row: ScheduleRow, key: string) => !hidden(key);
  return (
    <div className="plan-wrap">
      <table className="plan has-rail" aria-label="Rozpis tréninku">
        <thead>
          <tr>
            <th className="c-time">Čas</th>
            <th className="c-block">Disciplína</th>
            {visible.map((j) => (
              <th key={j}>Stůl {j + 1}</th>
            ))}
            <th className="c-wait">Volno</th>
          </tr>
        </thead>
        <tbody>
          {folded.size > 0 && (
            <tr className="rail st-done rb rail-first done-fold">
              <td className="c-time">
                <RailNode st={{ state: 'done', done: 0, total: 0, cells: [] }} label="Odehraná kola" />
              </td>
              <td colSpan={cols - 1}>
                <button type="button" className="fold-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
                  Odehráno {doneRounds} {plural(doneRounds, 'kolo', 'kola', 'kol')}
                  <span>{showDone ? 'skrýt' : 'zobrazit výsledky'}</span>
                </button>
              </td>
            </tr>
          )}
          {s.sections.map((sec, si) => {
            const rows = sec.rows.map((row, ri) => ({ row, key: rowKey({ section: si, row: ri }) })).filter((x) => shownRow(x.row, x.key));
            if (!rows.length) return null;
            const firstIdx = order.indexOf(rows[0].key);
            return (
            <Fragment key={`${sec.id}-${si}`}>
              <tr className={['section-row', railLine(rail, order, firstIdx - 1)].filter(Boolean).join(' ')}>
                <th colSpan={cols} scope="colgroup">
                  {sec.title}
                  {sec.subtitle && <span> – {sec.subtitle}</span>}
                  {sec.id === 'sim' && s.teams && (
                    <span className="sec-teams">
                      <span>
                        Tým A: <Names ids={s.teams.A} names={names} me={me} sep=", " />. Tým B: <Names ids={s.teams.B} names={names} me={me} sep=", " />.
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
              {sec.id === 'sim' && simSetup && (
                <tr className={['sim-setup-row', railLine(rail, order, firstIdx - 1)].filter(Boolean).join(' ')}>
                  <td colSpan={cols}>{simSetup}</td>
                </tr>
              )}
              {rows.map(({ row, key }) => {
                const idx = order.indexOf(key);
                const state = railClass(rail, order, idx);
                const st = rail.get(key);
                const no = numbers.get(key);
                const min = minutes.get(key);
                // Tužka u stolu (19. 11. 2026): otevřený zápis = `${klíč řádku}|${stůl}`, jen ten jeden stůl.
                const edit = manage && expanded?.startsWith(`${key}|`) ? Number(expanded.split('|')[1]) : null;
                const open = edit !== null;
                const progress = manage ? soloProgress(row, training) : null;
                const place = placeOf(row, me);
                const bi = row.breakIndex;
                if (row.kind === 'break') {
                  const editable = breaks && bi !== undefined && breaks.list[bi];
                  return (
                    <tr
                      key={key}
                      className={['break', row.label === 'Pauza' ? 'pause-row' : '', editable ? 'break-row' : '', state, dragging === bi ? 'dragging' : ''].filter(Boolean).join(' ')}
                      draggable={editable ? breaks!.movable(bi!) : undefined}
                      onDragStart={
                        editable
                          ? (e) => {
                              e.dataTransfer?.setData?.('text/plain', 'pauza');
                              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                              setDragging(bi!);
                            }
                          : undefined
                      }
                      onDragEnd={
                        editable
                          ? () => {
                              setDragging(null);
                              setDrop(null);
                            }
                          : undefined
                      }
                    >
                      <td className="c-time">
                        {row.label === 'Pauza' ? <RailNode st={st} pause /> : <RailNode st={st} label={row.label} />}
                        {clockAt(training.startTime, row.time)}
                      </td>
                      <td colSpan={visible.length + 2}>
                        {editable ? (
                          <BreakEditor i={bi!} c={breaks!} />
                        ) : (
                          <span className="row-label">
                            {row.label}
                            {min && row.label === 'Pauza' ? ` ${min} min` : ''}
                          </span>
                        )}
                        {pauseSlots?.get(key)}
                      </td>
                    </tr>
                  );
                }
                const droppable = dragging !== null && !!breaks && row.roundNo !== undefined;
                return (
                  <Fragment key={key}>
                    <tr
                      className={[state, row.kind, open ? 'open' : '', takesPart(place) ? 'mine-row' : '', drop?.key === key ? `drop-${drop.pos}` : ''].filter(Boolean).join(' ')}
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
                      <td className="c-time">
                        <RailNode st={st} no={no} />
                        {clockAt(training.startTime, row.time)}
                      </td>
                      <td className="c-block">
                        <span className="row-name">{rowName(row, sec.id)}</span>
                        {(min || rowFormat(row)) && <span className="cell-sub">{rowSub(min, row)}</span>}
                        {progress && <span className="cell-sub">{progress}</span>}
                      </td>
                      {visible.map((j) => {
                        const c = row.cells[j];
                        const id = c ? (c.type === 'match' ? c.match.id : drillItemId(row, j + 1, c.players)) : '';
                        const has = !!c && hasProgress(training, id, c.type === 'match' ? c.match : undefined);
                        const pk = `${key}|${j}`;
                        return (
                          <td key={j} className={c ? (has || manage ? 'has-prog' : undefined) : 'free'}>
                            {c && <CompactCell cell={c} t={training} names={names} me={me} />}
                            {c && (has || manage) && (
                              <span className="cell-ics">
                                {has && <ProgressToggle open={prog === pk} onToggle={() => setProg(prog === pk ? null : pk)} label={`${row.label}, stůl ${j + 1}`} />}
                                {manage && <EditToggle open={expanded === pk} done={st?.cells[j] === 'done'} label={`${row.label}, stůl ${j + 1}`} onToggle={() => onToggle(pk)} />}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="c-wait">{row.waiting.length ? <Names ids={row.waiting} names={names} me={me} sep=", " /> : '–'}</td>
                    </tr>
                    {prog?.startsWith(`${key}|`) &&
                      (() => {
                        const j = Number(prog.split('|')[1]);
                        const c = row.cells[j];
                        if (!c) return null;
                        return (
                          <tr className={['prog-row', railLine(rail, order, idx)].filter(Boolean).join(' ')}>
                            <td colSpan={cols}>
                              <span className="prog-k">Stůl {j + 1} · Průběh</span>
                              <ItemProgress
                                itemId={c.type === 'match' ? c.match.id : drillItemId(row, j + 1, c.players)}
                                match={c.type === 'match' ? c.match : undefined}
                                players={c.type === 'match' ? [...c.match.sideA, ...c.match.sideB] : c.players}
                                training={training}
                                names={names}
                              />
                            </td>
                          </tr>
                        );
                      })()}
                    {open && (
                      <tr className={['expand', railLine(rail, order, idx)].filter(Boolean).join(' ')}>
                        <td colSpan={cols}>
                          {/* Celkový výsledek bez stopek a ťukání; zapsaný dohraný výsledek utkání ukončí. */}
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
                            only={edit!}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
