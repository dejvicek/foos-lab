import { useEffect, useState } from 'react';
import { matchState } from '../../domain/matchFormat';
import { trainingProgress } from '../../domain/progress';
import { MyTimeline, RoundTileHead, roundName } from './RoundHeader';
import { CompactCell, Names } from './TrainingTable';
import { TableNo } from './TableNo';
import { flatRows, rowKey } from '../now';
import { keepLast, rowGoal, rowMinutes, rowName } from '../scheduleView';
import { myAssignments, type Assignment } from '../../domain/my';
import type { Match, MatchId, PlayerId, Schedule, Score, SoloKey, Training } from '../../domain/types';
import { BlockEntry, GameProgress, hasRoundHelp, RoundHelp, type TapEntry, type TapSolo } from './BlockEntry';
import type { ItemTiming } from './Timing';
import { drillItemId, readyKeys, type ItemState, type PauseState } from '../../domain/queue';
import { drillCount } from '../../domain/drillTap';
import { soloKey, soloMetric } from '../../domain/solo';
import { warmupState } from '../../domain/warmup';
import { fmtDur } from '../queue';

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
  /** Nejbližší pauza, která ještě neskončila (lišta Další kolo: čeká se na pauzu / odpočet). */
  pause?: PauseState | null;
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

/**
 * PRD 4.7 Moje hry (19. 11. 2026, *rozhodnutí uživatele*, návrh „Moje hry od Připraven po další utkání“):
 * pořád stejná kostra – časová osa (▼ zobrazené kolo, zlatě orámované kolo, které je na řadě) → lišta „Další kolo“
 * (jen u dohraného kola) → karta kola jako v Rozpisu se stavovým proužkem → akční zóna (jediné místo s tlačítky).
 * Po konci zůstává otevřené dohrané kolo (výsledek, Průběh); další kolo nabídne lišta.
 */
export function MyTable(props: Props) {
  const { schedule, training, names, playerId, since, timing } = props;
  const list = myAssignments(schedule, playerId);
  const segs = trainingProgress(schedule, training.durationMin);
  const now = timing?.now ?? Date.now();
  const itemOf = (x: Assignment) =>
    x.role === 'wait' ? null : x.match ? x.match.id : x.group && x.table ? drillItemId(x.row, x.table, x.group.players) : null;
  const stOf = (x: Assignment | undefined): ItemState | undefined => {
    const id = x ? itemOf(x) : null;
    return id ? timing?.state(id) : undefined;
  };
  const ended = (x: Assignment | undefined) => stOf(x)?.endedAt !== undefined;
  const activeIdx = list.findIndex((x) => stOf(x)?.state === 'ready' || stOf(x)?.state === 'playing');
  const own = list.map((x, k) => ({ k, s: stOf(x) })).filter((x) => x.s);
  const lastEnded = [...own].reverse().find((x) => x.s!.endedAt !== undefined)?.k ?? -1;
  const firstOpen = own.find((x) => x.s!.endedAt === undefined)?.k ?? -1;
  // Otevřít: hra na řadě / rozehraná, jinak poslední dohrané kolo (další nabídne lišta), jinak první moje kolo.
  const startIdx = () =>
    activeIdx >= 0 ? activeIdx : lastEnded >= 0 ? lastEnded : firstOpen >= 0 && timing ? firstOpen : initialIndex(list, since, training);
  const [idx, setIdx] = useState(startIdx);
  const [fix, setFix] = useState(false);
  // Nápověda kola pod řádkem se stolem (otazník v hlavičce, 19. 11. 2026).
  const [help, setHelp] = useState(false);
  const activeId = activeIdx >= 0 ? itemOf(list[activeIdx]) : null;
  // Další hra je na řadě: přepnout na ni – ne však z dohraného kola (tam ji nabídne lišta Další kolo).
  useEffect(() => {
    if (activeIdx >= 0) setIdx((cur) => (ended(list[cur]) && cur < activeIdx ? cur : activeIdx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);
  if (!list.length) return <p className="note">V tomhle rozpisu nemáš žádné kolo.</p>;
  const i = Math.min(idx, list.length - 1);
  const a = list[i];
  const go = (j: number) => {
    setFix(false);
    setHelp(false);
    setIdx(j);
  };
  const sec = schedule.sections.find((x) => x.rows.includes(a.row));
  const myItemId = itemOf(a);
  const ist = stOf(a);
  const myRow = {
    ...a.row,
    cells: a.row.cells.map((c, j) => (a.table !== undefined && j === a.table - 1 ? c : null)),
    waiting: a.role === 'wait' ? a.row.waiting : [],
  };
  const minutes = rowMinutes(schedule, training.format === 'custom' ? training.durationMin : undefined);
  const keyOf = (row: Assignment['row']) => {
    const ref = flatRows(schedule).find((r) => schedule.sections[r.section].rows[r.row] === row);
    return ref ? rowKey(ref) : '';
  };
  const secOf = (row: Assignment['row']) => schedule.sections.find((x) => x.rows.includes(row));
  // Další kolo: první moje neskončené kolo po zobrazeném.
  const nextIdx = list.findIndex((x, k) => k > i && stOf(x) && !ended(x));
  const nm = (ids: PlayerId[]) => ids.map((p) => names[p] ?? '?').join(' + ');

  /** Proč další utkání ještě nejde hrát (lišta Další kolo i proužek čekajícího kola). */
  const waitWhy = (x: Assignment, s: ItemState): { text: string; left?: number } => {
    if (s.waitingFor === 'training') return { text: 'Trénink ještě nezačal' };
    if (s.waitingFor === 'pause') {
      const p = props.pause;
      if (p?.state === 'running' && p.endsAt !== undefined) return { text: `Pauza ${p.min} min`, left: p.endsAt - now };
      return { text: 'Čeká se na pauzu – spustí ji organizátor' };
    }
    if (s.blockedBy?.length) {
      const mine = x.match ? (x.match.sideA.includes(playerId) ? x.match.sideA : x.match.sideB) : [];
      const opp = s.blockedBy.every((p) => !mine.includes(p)) && !!x.match;
      return { text: `Čeká se na ${opp ? 'soupeře' : 'hráče'} (${nm(s.blockedBy)})` };
    }
    return { text: 'Čeká se na stůl' };
  };

  /** Je výsledek dohraný (leg / všechny pokusy / Rozcvička doběhla)? */
  const over = (x: Assignment, s: ItemState | undefined): boolean => {
    if (x.match) return matchState(x.match, training.scores).over;
    const c = x.group;
    if (!c) return false;
    if (c.discipline === 'warmup') return s?.startedAt !== undefined && warmupState((now - s.startedAt) / 1000).done;
    if (!c.metric) return false;
    const def = soloMetric(c.metric);
    const key = soloKey(c.metric, c.soloRound);
    return c.players.every((p) => drillCount({ value: training.soloResults[p]?.[key], attempts: training.soloAttempts?.[p]?.[key] }, def).done);
  };

  // Připravenost: strany zápasu / hráči cvičení, za které smím hlásit.
  const slots = (() => {
    if (!myItemId || !timing?.canReady) return [];
    const players = a.match ? [...a.match.sideA, ...a.match.sideB] : (a.group?.players ?? []);
    const raw = a.match ? [{ key: 'A', label: nm(a.match.sideA) }, { key: 'B', label: nm(a.match.sideB) }] : players.map((p) => ({ key: p, label: names[p] ?? '?' }));
    return raw.filter((x) => timing.canReady!(x.key, { match: a.match, players }));
  })();
  const ready = (key: string, on: boolean) => {
    if (!myItemId || !timing?.ready) return;
    const players = a.match ? [...a.match.sideA, ...a.match.sideB] : (a.group?.players ?? []);
    timing.ready(myItemId, key, on, readyKeys({ match: a.match, players }));
  };
  const todo = slots.filter((x) => ist?.ready?.[x.key] === undefined);
  const mineReady = slots.length > 0 && todo.length === 0;

  const isEnded = ist?.endedAt !== undefined;
  const started = ist?.startedAt !== undefined;
  const isOver = !isEnded && started && over(a, ist);
  const isReady = !started && !isEnded && ist?.state === 'ready';

  // Výsledek dohraného zápasu z pohledu hráče.
  const verdict = (() => {
    const m = a.match;
    if (!m || a.role !== 'play') return '';
    const w = matchState(m, training.scores).winner;
    if (!w) return '';
    return w === (m.sideA.includes(playerId) ? 'A' : 'B') ? ' · vyhráli jste' : ' · prohráli jste';
  })();

  const fixLink = (
    <button type="button" className="link" onClick={() => setFix(!fix)}>
      {fix ? 'Hotovo' : 'Opravit'}
    </button>
  );
  /** Stavový proužek karty (19. 11. 2026): Na řadě · Hraje se · Dohráno · důvod čekání. */
  const strip = (() => {
    if (a.role === 'wait' || !ist) return null;
    if (isEnded)
      return (
        <div className="c-state ok" role="status">
          <span>✓ Dohráno{verdict}</span>
          {fixLink}
        </div>
      );
    if (isOver)
      return (
        <div className="c-state live" role="status">
          <span>Dohráno</span>
          {fixLink}
        </div>
      );
    if (started)
      return (
        <div className="c-state live" role="status">
          <span>● Hraje se</span>
          <span className="count">{fmtDur(now - ist.startedAt!)}</span>
        </div>
      );
    if (isReady)
      return (
        <div className="c-state live" role="status">
          <span>● Na řadě{mineReady ? ' · čeká se na soupeře' : ''}</span>
          {mineReady && (
            <span>
              ✓{' '}
              {slots.map((x) => (
                <button key={x.key} type="button" className="link" aria-label={`Zrušit připravenost: ${x.label}`} onClick={() => ready(x.key, false)}>
                  zrušit
                </button>
              ))}
            </span>
          )}
        </div>
      );
    const w = waitWhy(a, ist);
    return (
      <div className="c-state wait" role="status">
        <span>{w.text}</span>
        {w.left !== undefined && <span className="count">{fmtDur(Math.max(0, w.left))}</span>}
      </div>
    );
  })();

  /** Lišta Další kolo (jen u dohraného kola): na řadě → Otevřít; jinak důvod čekání. */
  const nextBar = (() => {
    if (!(isEnded || (a.role === 'wait' && nextIdx >= 0)) || nextIdx < 0) return null;
    const nx = list[nextIdx];
    const s = stOf(nx)!;
    const name = `${rowName(nx.row, secOf(nx.row)?.id)}${nx.table ? ` · stůl ${nx.table}` : ''}`;
    if (s.state === 'ready' || s.state === 'playing')
      return (
        <div className="next-bar ready">
          <span className="k">Na řadě</span>
          <span className="w">{name}</span>
          <span className="why">{summary(nx, names, playerId)}</span>
          <button type="button" className="go" onClick={() => go(nextIdx)} aria-label={`Otevřít ${nx.row.label}: ${roundName(nx)}`}>
            Otevřít ›
          </button>
        </div>
      );
    const w = waitWhy(nx, s);
    return (
      <div className="next-bar wait" role="status">
        <span className="k">Další kolo{w.left !== undefined ? ' · po pauze' : ''}</span>
        <span className="w">{name}</span>
        <span className="why">
          <b>{w.text}</b>
        </span>
        {w.left !== undefined && <span className="left">{fmtDur(Math.max(0, w.left))}</span>}
      </div>
    );
  })();

  const entry = (
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
      timing={timing}
      onTapSolo={props.onTapSolo}
      timelineOpen
      noHelp
      bare
      fix={fix}
    />
  );
  /** Akční zóna (19. 11. 2026): Připraven → zápis → Potvrdit konec → Průběh; oprava přes „Opravit“ v proužku. */
  const zone = (() => {
    if (a.role === 'wait' || !ist || !myItemId) return null;
    const left = timing?.autoEndIn?.(myItemId) ?? null;
    const confirmEnd = (
      <>
        <button type="button" className="big-action" onClick={() => timing?.end(myItemId)}>
          Potvrdit konec
        </button>
        {left !== null && <p className="note">Utkání skončí samo za {Math.ceil(left / 1000)} s.</p>}
      </>
    );
    // Oprava výsledku: zápis; u dohraného, ještě nepotvrzeného i Potvrdit konec s odpočtem.
    if (fix)
      return (
        <div className="my-zone">
          {entry}
          {isOver && confirmEnd}
        </div>
      );
    if (isEnded)
      return a.table !== undefined ? (
        <div className="my-zone">
          <GameProgress row={a.row} table={a.table} training={training} names={names} />
        </div>
      ) : null;
    if (isOver)
      return (
        <div className="my-zone">
          {/* Notebook: výběr skóre zůstává (6 gólů vlevo je dohráno, ale soupeřovy góly se teprve vybírají). */}
          {!props.tap && entry}
          {confirmEnd}
        </div>
      );
    if (started)
      return (
        <div className="my-zone play">
          {entry}
          <button type="button" className="ghost end-early" onClick={() => timing?.end(myItemId)}>
            Potvrdit konec
          </button>
        </div>
      );
    if (isReady && todo.length)
      return (
        <div className="my-zone">
          {todo.map((x) => (
            <button key={x.key} type="button" className="big-action" onClick={() => ready(x.key, true)} aria-label={todo.length > 1 || slots.length > 1 ? `Připraven: ${x.label}` : 'Připraven'}>
              {todo.length > 1 || slots.length > 1 ? `Připraven – ${x.label}` : 'Připraven'}
            </button>
          ))}
        </div>
      );
    return null;
  })();

  return (
    <section className={`my-table${started && !isEnded && !isOver && !fix ? ' playing' : ''}`} aria-label="Moje kolo">
      <MyTimeline
        segs={segs}
        current={i}
        upcoming={nextIdx >= 0 && nextIdx !== i ? nextIdx : undefined}
        startTime={training.startTime}
        onPick={(j) => go(j)}
        prev={{ disabled: i === 0, onClick: () => go(i - 1) }}
        next={{ disabled: i === list.length - 1, onClick: () => go(i + 1) }}
      />
      {nextBar}
      {/* Kolo jako dlaždice v Rozpisu: hlavička, můj stůl (velké číslo + zápas) a stavový proužek. */}
      <article className="round-card my-card mine-row" aria-label={`${a.row.label}, ${rowName(a.row, sec?.id)}`}>
        <RoundTileHead
          a={a}
          name={keepLast(rowName(a.row, sec?.id))}
          format={rowGoal(a.row)}
          min={minutes.get(keyOf(a.row))}
          startTime={training.startTime}
          me={playerId}
          help={hasRoundHelp(a.row) ? { open: help, onToggle: () => setHelp(!help) } : undefined}
        />
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
                    <CompactCell cell={a.row.cells[a.table - 1]!} t={training} names={names} me={playerId} roundName={rowName(a.row, sec?.id)} noLive />
                  </span>
                </span>
              </div>
            )
          )}
        </div>
        {strip}
        {help && (
          <div className="my-help help" role="region" aria-label="Nápověda">
            <RoundHelp row={a.row} untitledMain />
          </div>
        )}
      </article>
      {zone}
    </section>
  );
}
