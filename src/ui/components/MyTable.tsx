import { useState } from 'react';
import { myAssignments, type Assignment } from '../../domain/my';
import { clockAt } from '../../domain/solo';
import { legOver } from '../../domain/legState';
import type { Match, MatchId, PlayerId, Schedule, Score, SoloKey, Training } from '../../domain/types';
import { BlockEntry, type TapEntry } from './BlockEntry';

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
  const [idx, setIdx] = useState(() => initialIndex(list, since, training));
  if (!list.length) return <p className="note">V tomhle rozpisu nemáš žádné kolo.</p>;
  const i = Math.min(idx, list.length - 1);
  const a = list[i];
  const next = list[i + 1];
  const sec = schedule.sections.find((s) => s.rows.includes(a.row));
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
        />
      )}
      {next && a.match && a.role !== 'wait' && legOver(a.match, training.scores[a.match.id]).over && (
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
