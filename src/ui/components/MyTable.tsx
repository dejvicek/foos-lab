import { useEffect, useState } from 'react';
import { matchState } from '../../domain/matchFormat';
import { tableScore } from '../../domain/legState';
import { trainingProgress } from '../../domain/progress';
import { MyTimeline, RoundTileHead, roundName } from './RoundHeader';
import { CompactCell, Names } from './TrainingTable';
import { TableNo } from './TableNo';
import { flatRows, rowKey } from '../now';
import { keepLast, rowFormat, rowMinutes, rowName } from '../scheduleView';
import { myAssignments, type Assignment } from '../../domain/my';
import type { Match, MatchId, PlayerId, Schedule, Score, SoloKey, Training } from '../../domain/types';
import { BlockEntry, GameProgress, hasRoundHelp, RoundHelp, type TapEntry, type TapSolo } from './BlockEntry';
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
    if ((a.match.bestOf ?? 1) > 1) return !matchState(a.match, t.scores).over;
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

/** Výsledek dohraného utkání z pohledu hráče: „6:4 · vyhráli jste“ (BO na legy). */
function resultOf(a: Assignment, t: Training, me: PlayerId): string {
  const m = a.match;
  if (!m) return 'hotovo';
  const st = matchState(m, t.scores);
  const flip = a.role === 'play' && m.sideB.includes(me);
  const multi = (m.bestOf ?? 1) > 1;
  const [x, y] = multi ? [st.legsA, st.legsB] : tableScore(st.legs[st.legs.length - 1].leg, st.legs[st.legs.length - 1].score);
  const score = flip ? `${y}:${x}` : `${x}:${y}`;
  const mine = flip ? 'B' : 'A';
  const verdict = a.role !== 'play' || !st.winner ? '' : st.winner === mine ? ' · vyhráli jste' : ' · prohráli jste';
  return `${score}${multi ? ' na legy' : ''}${verdict}`;
}

/**
 * PRD 4.7 „Můj stůl“: moje aktuální kolo se zápisem, listování mezi koly. Od 18. 11. 2026 nahoře nadpis
 * kola s průběhem tréninku a po konci utkání přechod: „4. kolo dohráno“ a karta dalšího kola „Otevřít“ –
 * Moje hry se z dohraného utkání na další samy nepřepnou (hráči nevěděli, že je jiná disciplína).
 */
export function MyTable(props: Props) {
  const { schedule, training, names, playerId, since } = props;
  const list = myAssignments(schedule, playerId);
  const segs = trainingProgress(schedule, training.durationMin);
  // Rozehraná hra (na řadě / hraje se) má přednost – Moje hry ji otevřou.
  const itemOf = (x: Assignment) =>
    x.role === 'wait' ? null : x.match ? x.match.id : x.group && x.table ? drillItemId(x.row, x.table, x.group.players) : null;
  const ended = (x: Assignment | undefined) => {
    const id = x ? itemOf(x) : null;
    return !!id && props.timing?.state(id)?.endedAt !== undefined;
  };
  const activeIdx = list.findIndex((x) => {
    const id = itemOf(x);
    const st = id ? props.timing?.state(id)?.state : undefined;
    return st === 'ready' || st === 'playing';
  });
  const [idx, setIdx] = useState(() => (activeIdx >= 0 ? activeIdx : initialIndex(list, since, training)));
  const [fix, setFix] = useState(false);
  // Listování šipkami: starší dohrané kolo se ukáže normálně (výsledek a Průběh), ne jako přechod.
  const [browse, setBrowse] = useState(false);
  // Nápověda kola pod řádkem se stolem (otazník v hlavičce, 19. 11. 2026).
  const [help, setHelp] = useState(false);
  const activeId = activeIdx >= 0 ? itemOf(list[activeIdx]) : null;
  // Další hra je na řadě: přepnout na ni – ne však z dohraného utkání (tam čeká přechod s „Otevřít“).
  useEffect(() => {
    if (activeIdx >= 0) setIdx((cur) => (ended(list[cur]) && cur < activeIdx ? cur : activeIdx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);
  if (!list.length) return <p className="note">V tomhle rozpisu nemáš žádné kolo.</p>;
  const i = Math.min(idx, list.length - 1);
  const a = list[i];
  const go = (j: number, manual = false) => {
    setFix(false);
    setHelp(false);
    setBrowse(manual);
    setIdx(j);
  };
  const sec = schedule.sections.find((s) => s.rows.includes(a.row));
  const myItemId = itemOf(a);
  const myRow = {
    ...a.row,
    cells: a.row.cells.map((c, j) => (a.table !== undefined && j === a.table - 1 ? c : null)),
    waiting: a.role === 'wait' ? a.row.waiting : [],
  };
  // Kam vede „Otevřít“: na hru, která je na řadě, jinak na další kolo.
  const target = activeIdx > i ? activeIdx : i + 1 < list.length ? i + 1 : null;
  const finished = a.role !== 'wait' && !!myItemId && ended(a);
  const minutes = rowMinutes(schedule, training.format === 'custom' ? training.durationMin : undefined);
  const keyOf = (row: Assignment['row']) => {
    const ref = flatRows(schedule).find((r) => schedule.sections[r.section].rows[r.row] === row);
    return ref ? rowKey(ref) : '';
  };
  const secOf = (row: Assignment['row']) => schedule.sections.find((x) => x.rows.includes(row));
  /** Hlavička kola jako dlaždice v Rozpisu: čas · název · formát, „Kolo 2 ze 14 · 8 min“, pravidlo. */
  const header = (j: number, inline = false, withHelp = false) => (
    <RoundTileHead
      key={j}
      a={list[j]}
      name={keepLast(rowName(list[j].row, secOf(list[j].row)?.id))}
      format={rowFormat(list[j].row, true)}
      min={minutes.get(keyOf(list[j].row))}
      startTime={training.startTime}
      me={playerId}
      inline={inline}
      help={withHelp && hasRoundHelp(list[j].row) ? { open: help, onToggle: () => setHelp(!help) } : undefined}
    />
  );
  const nextCard = target !== null && (
    <button type="button" className="my-nextcard" onClick={() => go(target)} aria-label={`Otevřít ${list[target].row.label}: ${roundName(list[target])}`}>
      <span className="k">{activeIdx === target ? 'Další kolo · na řadě' : 'Další kolo'}</span>
      {header(target, true)}
      <span className="vs">{summary(list[target], names, playerId)}</span>
      <span className="open">Otevřít ›</span>
    </button>
  );
  const done = finished && (
    <div className="my-finished" role="status">
      <b>
        ✓ {a.row.label} dohráno · {resultOf(a, training, playerId)}
      </b>
      <span>
        {roundName(a)}
        {!fix && !browse && (
          <>
            {' · '}
            <button type="button" className="link" onClick={() => setFix(true)}>
              Opravit výsledek
            </button>
          </>
        )}
      </span>
    </div>
  );
  // Přechod: dohrané utkání a další kolo jako jedna karta – dál jde až po ťuknutí.
  if (finished && target !== null && !fix && !browse)
    return (
      <section className="my-table my-transition" aria-label="Moje kolo">
        {done}
        {a.table !== undefined && <GameProgress row={a.row} table={a.table} training={training} names={names} />}
        {nextCard}
      </section>
    );
  return (
    <section className="my-table" aria-label="Moje kolo">
      <MyTimeline
        segs={segs}
        current={i}
        startTime={training.startTime}
        onPick={(j) => go(j, true)}
        prev={{ disabled: i === 0, onClick: () => go(i - 1, true) }}
        next={{ disabled: i === list.length - 1, onClick: () => go(i + 1, true) }}
      />
      {/* Kolo jako dlaždice v Rozpisu: hlavička a můj stůl (velké číslo + zápas), bez opakování „stůl 2“ (19. 11. 2026). */}
      <article className="round-card my-card mine-row" aria-label={`${a.row.label}, ${rowName(a.row, sec?.id)}`}>
        {header(i, false, true)}
        <div className="tile-rows">
          {a.role === 'wait' ? (
            <div className="tile-line">
              <span className="tile-row">
                <b>Volno</b>
                <span>
                  {a.row.waiting.length ? <Names ids={a.row.waiting} names={names} me={playerId} sep=", " /> : null}
                  {sec?.id === 'drills' && !a.row.waitingLabel && ' · počítáš'}
                </span>
              </span>
            </div>
          ) : (
            a.table !== undefined &&
            a.row.cells[a.table - 1] && (
              <div className="tile-line">
                <span className="tile-row">
                  <TableNo n={a.table} mine />
                  <span>
                    <CompactCell cell={a.row.cells[a.table - 1]!} t={training} names={names} me={playerId} roundName={rowName(a.row, sec?.id)} />
                  </span>
                </span>
              </div>
            )
          )}
        </div>
        {help && (
          <div className="my-help help" role="region" aria-label="Nápověda">
            <RoundHelp row={a.row} untitledMain />
          </div>
        )}
      </article>
      {done}
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
          noHelp
        />
      )}
      {finished && !browse && nextCard}
    </section>
  );
}
