import { useEffect, useState } from 'react';
import { myAssignments, type Assignment } from '../../domain/my';
import { clockAt } from '../../domain/solo';
import type { Match, MatchId, PlayerId, Schedule, Score, SoloKey, Training } from '../../domain/types';
import { BlockEntry, type TapEntry, type TapSolo } from './BlockEntry';
import type { ItemTiming } from './Timing';
import { drillItemId } from '../../domain/queue';

interface Props {
  schedule: Schedule;
  training: Training;
  names: Record<PlayerId, string>;
  playerId: PlayerId;
  /** Minuty od začátku tréninku, null = trénink není dnes. */
  since: number | null;
  onScore(id: MatchId, s: Score): void;
  onSolo(playerId: PlayerId, key: SoloKey, value: number | null): void;
  canMatch(m: Match): boolean;
  canSolo(group: PlayerId[], playerId: PlayerId): boolean;
  /** Telefon: ťukací zrcadlo; notebook: čísla na kliknutí. */
  tap?: TapEntry;
  /** Zdržovači: Zahájit / Ukončit; skóre až po zahájení. */
  timing?: ItemTiming;
  onTapSolo?: TapSolo;
}

function missing(a: Assignment, t: Training): boolean {
  if (a.match) {
    const s = t.scores[a.match.id];
    return s?.ga === undefined || s?.ga === null || s?.gb === undefined || s?.gb === null;
  }
  return false;
}

/** Výchozí kolo: dnes podle hodin, jinak první moje kolo bez zapsaného výsledku. */
function initialIndex(list: Assignment[], since: number | null, t: Training): number {
  if (since !== null) {
    let idx = 0;
    list.forEach((a, i) => {
      if (a.row.time <= since) idx = i;
    });
    return idx;
  }
  const i = list.findIndex((a) => a.role !== 'wait' && missing(a, t));
  return i < 0 ? 0 : i;
}

function summary(a: Assignment, names: Record<PlayerId, string>, me: PlayerId): string {
  const nm = (ids: PlayerId[]) => ids.map((p) => names[p] ?? '?').join(' + ');
  if (a.role === 'wait') return 'nehraješ';
  if (a.role === 'referee' && a.match) return `rozhodčí u stolu ${a.table}`;
  if (a.match) {
    const mineA = a.match.sideA.includes(me);
    const partners = (mineA ? a.match.sideA : a.match.sideB).filter((p) => p !== me);
    const opp = mineA ? a.match.sideB : a.match.sideA;
    return `stůl ${a.table}${partners.length ? `, s ${nm(partners)}` : ''} proti ${nm(opp)}`;
  }
  if (a.group) {
    const others = a.group.players.filter((p) => p !== me);
    return `stůl ${a.table}${others.length ? `, s ${nm(others)}` : ''}`;
  }
  return '';
}

/** PRD 4.7 „Můj stůl“: moje aktuální kolo se zápisem, listování mezi koly. */
export function MyTable(props: Props) {
  const { schedule, training, names, playerId, since } = props;
  const list = myAssignments(schedule, playerId);
  // Rozehraná hra (na řadě / hraje se) má přednost – Moje hry ji otevřou vždy.
  const itemOf = (x: Assignment) =>
    x.role === 'wait' ? null : x.match ? x.match.id : x.group && x.table ? drillItemId(x.row, x.table, x.group.players) : null;
  const activeIdx = list.findIndex((x) => {
    const id = itemOf(x);
    const st = id ? props.timing?.state(id)?.state : undefined;
    return st === 'ready' || st === 'playing';
  });
  const [idx, setIdx] = useState(() => (activeIdx >= 0 ? activeIdx : initialIndex(list, since, training)));
  const activeId = activeIdx >= 0 ? itemOf(list[activeIdx]) : null;
  // Když se rozehraná hra změní (další kolo je na řadě), přepnout na ni.
  useEffect(() => {
    if (activeIdx >= 0) setIdx(activeIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);
  if (!list.length) return <p className="note">V tomhle rozpisu nemáš žádné kolo.</p>;
  const i = Math.min(idx, list.length - 1);
  const a = list[i];
  const next = list[i + 1];
  const sec = schedule.sections.find((s) => s.rows.includes(a.row));
  // Moje utkání v tomhle kole (zápas, nebo skupina ve cvičení) – „Na další kolo“ po potvrzeném konci.
  const myItemId = a.match ? a.match.id : a.group && a.table ? drillItemId(a.row, a.table, a.group.players) : null;
  const myRow = {
    ...a.row,
    cells: a.row.cells.map((c, j) => (a.table !== undefined && j === a.table - 1 ? c : null)),
    waiting: a.role === 'wait' ? a.row.waiting : [],
  };
  return (
    <section className="my-table" aria-label="Moje kolo">
      <div className="my-head">
        <button type="button" className="icon" aria-label="Předchozí kolo" disabled={i === 0} onClick={() => setIdx(i - 1)}>
          ‹
        </button>
        <div className="my-title">
          <h2>
            {a.row.label}, {clockAt(training.startTime, a.row.time)}
          </h2>
          <span>{a.row.rule}</span>
        </div>
        <button type="button" className="icon" aria-label="Další kolo" disabled={i === list.length - 1} onClick={() => setIdx(i + 1)}>
          ›
        </button>
      </div>
      <p className="my-role">
        <strong>{names[playerId] ?? ''}</strong>: {summary(a, names, playerId)}
        {a.role === 'wait' && sec?.id === 'drills' && ', počítáš'}
      </p>
      {a.role !== 'wait' && (
        <BlockEntry
          row={myRow}
          waitingLabel={sec?.waitingLabel ?? 'Mimo stůl'}
          training={training}
          names={names}
          onScore={props.onScore}
          onSolo={props.onSolo}
          canMatch={props.canMatch}
          canSolo={props.canSolo}
          tap={props.tap}
          timing={props.timing}
          onTapSolo={props.onTapSolo}
          timelineOpen
        />
      )}
      {next && a.role !== 'wait' && myItemId && props.timing?.state(myItemId)?.endedAt !== undefined && (
        <button type="button" className="my-go-next" onClick={() => setIdx(i + 1)}>
          Na další kolo ›
        </button>
      )}
      {next && (
        <p className="my-next">
          Další: {next.row.label}, {clockAt(training.startTime, next.row.time)}, {next.row.rule?.split(',')[0]}: {summary(next, names, playerId)}
        </p>
      )}
    </section>
  );
}
