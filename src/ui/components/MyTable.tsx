import { useEffect, useState } from 'react';
import { matchState } from '../../domain/matchFormat';
import { rowKind, trainingProgress } from '../../domain/progress';
import { MyTimeline, RoundTileHead, roundName } from './RoundHeader';
import { CompactCell, Names } from './TrainingTable';
import { TableNo } from './TableNo';
import { flatRows, rowKey } from '../now';
import type { RoundStatus } from '../roundState';
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
  /** Stav kol podle skutečnosti: barvy osy (odehraná plně) nezávisle na zobrazeném kole (19. 11. 2026). */
  rounds?: Map<string, RoundStatus> | null;
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
  // Odehraná kola na ose (plná barva) podle skutečnosti, ne podle zobrazeného kola (19. 11. 2026, *rozhodnutí uživatele*):
  // kde hraju / cvičím, hned po konci mého utkání; Volno, až je dohrané celé kolo.
  const roundDone = (row: Assignment['row']) => {
    const mine = list.find((x) => x.row === row);
    return mine && itemOf(mine) ? ended(mine) : props.rounds?.get(keyOf(row))?.state === 'done';
  };
  const played = new Set(segs.filter((x) => x.kind === 'round' && roundDone(x.row)).map((x) => x.index!));
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

  /** Řádek stolu jako v dlaždici Rozpisu: velké číslo stolu + zápas / hráči, nebo Volno. */
  const tableRows = (x: Assignment) => {
    const xs = secOf(x.row);
    return (
      <div className="tile-rows">
        {x.role === 'wait' ? (
          <div className="tile-line">
            <span className="tile-row">
              <b>Volno</b>
              <span>
                {x.row.waiting.length ? <Names ids={x.row.waiting} names={names} me={playerId} sep=", " /> : null}
                {xs?.id === 'drills' && !x.row.waitingLabel && ' · počítáš'}
              </span>
            </span>
          </div>
        ) : (
          x.table !== undefined &&
          x.row.cells[x.table - 1] && (
            <div className="tile-line">
              <span className="tile-row">
                <TableNo n={x.table} mine />
                <span>
                  <CompactCell cell={x.row.cells[x.table - 1]!} t={training} names={names} me={playerId} roundName={rowName(x.row, xs?.id)} noLive />
                </span>
              </span>
            </div>
          )
        )}
      </div>
    );
  };

  /**
   * Karta Další kolo (jen u dohraného kola) jako karta kola (19. 11. 2026, *rozhodnutí uživatele*): hlavička a stůl
   * jako v Rozpisu, čárkovaný rám v barvě druhu kola (na řadě plně, čeká světle); proužek Na řadě → Otevřít, jinak důvod.
   */
  const nextBar = (() => {
    if (!(isEnded || (a.role === 'wait' && nextIdx >= 0)) || nextIdx < 0) return null;
    const nx = list[nextIdx];
    const s = stOf(nx)!;
    const up = s.state === 'ready' || s.state === 'playing';
    const w = up ? null : waitWhy(nx, s);
    return (
      <article className={`round-card next-bar ${up ? 'ready' : 'wait'} rk-${rowKind(nx.row)}`} aria-label={`Další kolo: ${nx.row.label}, ${rowName(nx.row, secOf(nx.row)?.id)}`}>
        <span className="next-k">Další kolo{w?.left !== undefined ? ' · po pauze' : ''}</span>
        <RoundTileHead
          a={nx}
          name={keepLast(rowName(nx.row, secOf(nx.row)?.id))}
          format={rowGoal(nx.row)}
          min={minutes.get(keyOf(nx.row))}
          startTime={training.startTime}
          me={playerId}
        />
        {tableRows(nx)}
        {up ? (
          <div className="c-state live" role="status">
            <span>● Na řadě</span>
            {/* Odkaz jako Opravit v proužku Dohráno (19. 11. 2026, *rozhodnutí uživatele*). */}
            <button type="button" className="link" onClick={() => go(nextIdx)} aria-label={`Otevřít ${nx.row.label}: ${roundName(nx)}`}>
              Otevřít
            </button>
          </div>
        ) : (
          <div className="c-state wait" role="status">
            <b>{w!.text}</b>
            {w!.left !== undefined && <span className="count">{fmtDur(Math.max(0, w!.left))}</span>}
          </div>
        )}
      </article>
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
        played={played}
        // Vyšší dílek = aktuální kolo: na řadě / rozehrané plnou barvou, jinak moje další kolo, které na něco čeká,
        // světle jako neodehrané (19. 11. 2026, *rozhodnutí uživatele*).
        active={activeIdx >= 0 ? activeIdx : firstOpen >= 0 ? firstOpen : undefined}
        activeWaits={activeIdx < 0}
        startTime={training.startTime}
        onPick={(j) => go(j)}
        prev={{ disabled: i === 0, onClick: () => go(i - 1) }}
        next={{ disabled: i === list.length - 1, onClick: () => go(i + 1) }}
      />
      {nextBar}
      {/* Kolo jako dlaždice v Rozpisu: hlavička, můj stůl (velké číslo + zápas) a stavový proužek. */}
      <article className={`round-card my-card mine-row rk-${rowKind(a.row)}`} aria-label={`${a.row.label}, ${rowName(a.row, sec?.id)}`}>
        <RoundTileHead
          a={a}
          name={keepLast(rowName(a.row, sec?.id))}
          format={rowGoal(a.row)}
          min={minutes.get(keyOf(a.row))}
          startTime={training.startTime}
          me={playerId}
          help={hasRoundHelp(a.row) ? { open: help, onToggle: () => setHelp(!help) } : undefined}
        />
        {tableRows(a)}
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
