import { useMemo, useState } from 'react';
import { buildSchedule, canBuildSchedule } from '../../domain/schedule';
import { commitEdit, configChanged, prepareEdit } from '../trainingEdit';
import { OrderTeamsFields, SPLIT_TEXT } from '../components/TrainingSetup';
import { lockThrough, roundOfMatch } from '../../domain/customSchedule';
import { parseSoloKey } from '../../domain/solo';
import type { Match, MatchId, PlayerId, Score, SoloKey, Training } from '../../domain/types';
import { canManage, canWriteMatch, canWriteSolo, type Viewer } from '../../domain/my';
import { MyTable } from '../components/MyTable';
import { TrainingTable, type BreakControls } from '../components/TrainingTable';
import { addBreak, breakMovable, breaksOf, freeSlots, moveBreak, removeBreak, setBreakMin, stepTarget } from '../../domain/breaks';
import { RoundCards } from '../components/RoundCards';
import type { TapSolo } from '../components/BlockEntry';
import { useMobile } from '../useMobile';
import { ActiveMatches } from '../components/ActiveMatches';
import { FlowBar } from '../components/FlowBar';
import { DelayTable, type ItemTiming } from '../components/Timing';
import { delayStats, pauseStates, TRAINING_ITEM, type QueueEntry } from '../../domain/queue';
import { bump, legOver } from '../../domain/legState';
import { trainingQueue, useTick } from '../queue';
import { usedTables } from '../components/TrainingTable';
import { currentRow, defaultOpenRow, minutesSinceStart, rowKey, useNow } from '../now';
import { StandingsView } from '../components/StandingsView';
import { formatDateLong } from '../dates';
import { MODE_LABEL, plural } from '../format';
import type { AppStore } from '../useAppState';
import type { Route } from '../useHashRoute';

/** „Změna smaže skóre u N zápasů a M výsledků sólové části. Pokračovat?“ – null, když se nic nesmaže. */

export function TrainingPage({
  store,
  id,
  navigate,
  viewer = { playerId: null, isAdmin: true },
}: {
  store: AppStore;
  id: string;
  navigate: (r: Route) => void;
  viewer?: Viewer;
}) {
  const training = store.data.trainings.find((t) => t.id === id);
  // Rozpis závisí i na skóre: týmy simulace se dělí podle výkonu ve scénářové lize.
  const schedule = useMemo(() => (training && canBuildSchedule(training) ? buildSchedule(training) : null), [training]);
  const names = useMemo(() => Object.fromEntries(store.data.players.map((p) => [p.id, p.name])), [store.data.players]);
  const now = useNow();
  const mobile = useMobile();
  // null = výchozí (běžící / první nevyplněný blok), '' = vše sbalené, jinak klíč řádku
  const [expanded, setExpanded] = useState<string | null>(null);
  const attends = !!training && viewer.playerId !== null && training.attendees.includes(viewer.playerId);
  const [tab, setTab] = useState<'mine' | 'active' | 'all'>(() =>
    attends && !viewer.isAdmin && training?.createdBy !== viewer.playerId ? 'mine' : 'all',
  );
  // Stopky běží jen na obrazovkách, kde jsou vidět (Můj stůl, Aktivní utkání).
  const tick = useTick(1000, !!training && tab !== 'all');
  // Po vlastní změně (Ukončit) přepočítat hned, ne až s dalším tikem stopek.
  const queueInfo = useMemo(() => (training && schedule ? trainingQueue(training, Math.max(tick, Date.now()), schedule) : null), [training, schedule, tick]);
  if (!training) {
    return (
      <section>
        <p>Trénink nenalezen.</p>
        <button type="button" className="ghost" onClick={() => navigate({ page: 'trainings' })}>
          Zpět na tréninky
        </button>
      </section>
    );
  }

  const since = minutesSinceStart(training.date, training.startTime, now);
  const current = schedule ? currentRow(schedule, since) : null;
  const fallback = schedule ? defaultOpenRow(schedule, training, since) : null;
  const openKey = expanded ?? (fallback ? rowKey(fallback) : null);

  /** Úprava z rozpisu (pauzy): přeplánovat, při ztrátě výsledků se zeptat, uložit. */
  const apply = (input: Training) => {
    const next = prepareEdit(training, input);
    if (commitEdit(store, training, next) && configChanged(training, next)) setExpanded(null); // klíč řádku je pozice
  };
  const manage = canManage(viewer, training);
  const canMatch = (m: Match) => canWriteMatch(viewer, m, training);
  const canSolo = (group: PlayerId[], p: PlayerId) => canWriteSolo(viewer, group, p, training);
  /** Uloží zamčení kol / týmů: admin přímo, hráč přes funkci na serveru. */
  const persistLock = (next: Training) => (manage ? store.saveTraining(next) : store.lockRounds(next));
  /** Před zápisem výsledku zamkne kola (a týmy simulace) – jedno uložení, jinak by se přepsala. */
  const lockForMatch = (matchId: MatchId) => {
    let next = withLocked(training, roundOfMatch(schedule!, matchId));
    const m = schedule!.matches.find((x) => x.id === matchId);
    // První výsledek simulace zamkne týmy, aby je pozdější opravy ligy nepřeházely.
    if (m?.block === 'sim' && !training.simTeams && training.simSplit !== 'manual' && schedule!.teams)
      next = { ...next, simTeams: schedule!.teams };
    if (next !== training) persistLock(next);
  };
  /** Dohraný leg utkání ukončí, oprava pod konec ho znovu otevře (jen zahájené utkání). */
  const syncEnd = (m: Match, sc: Score) => {
    const pt = training.playTimes?.[m.id];
    if (pt?.startedAt === undefined) return;
    const over = legOver(m, sc).over;
    if (over && pt.endedAt === undefined) store.setPlayTime(training.id, m.id, { startedAt: pt.startedAt, endedAt: Date.now() });
    else if (!over && pt.endedAt !== undefined) store.setPlayTime(training.id, m.id, { startedAt: pt.startedAt });
  };
  const onScore = (matchId: MatchId, sc: Score) => {
    lockForMatch(matchId);
    const m = schedule?.matches.find((x) => x.id === matchId);
    if (m) syncEnd(m, sc);
    store.saveScore(training.id, matchId, sc);
  };
  const onSolo = (playerId: PlayerId, key: SoloKey, value: number | null) => {
    const next = withLocked(training, parseSoloKey(key).round || null);
    if (next !== training) persistLock(next);
    store.saveSolo(training.id, playerId, key, value);
  };
  // PRD 4.6: pauzy (kolik, kde, jak dlouhé) upravuje správce konfigurovatelného tréninku.
  const breakControls: BreakControls | undefined =
    manage && training.format === 'custom' && schedule
      ? (() => {
          const nextSlot = (i: number, dir: -1 | 1) => stepTarget(training, i, dir);

          return {
            list: breaksOf(training),
            movable: (i) => breakMovable(training, i),
            canMoveTo: (i, after) => breakMovable(training, i) && freeSlots(training, i).includes(after),
            move: (i, after) => apply(moveBreak(training, i, after)),
            step: (i, dir) => {
              const a = nextSlot(i, dir);
              if (a !== null) apply(moveBreak(training, i, a));
            },
            canStep: (i, dir) => breakMovable(training, i) && nextSlot(i, dir) !== null,
            setMin: (i, min) => apply(setBreakMin(training, i, min)),
            remove: (i) => apply(removeBreak(training, i)),
          };
        })()
      : undefined;
  const canAddBreak = !!breakControls && freeSlots(training).length > 0;

  /** Smí přihlášený zahájit / ukončit utkání? Zápas jako skóre, cvičení hráči skupiny a správce. */
  const canItem = (e: Extract<QueueEntry, { kind: 'item' }>) =>
    e.match ? canMatch(e.match) : manage || (!!viewer.playerId && e.players.includes(viewer.playerId));
  const delays = queueInfo ? delayStats(queueInfo.queue, queueInfo.states) : [];
  // Týmy simulace: nastavují se v tréninku, dokud simulace nezačala (pak jsou zamčené).
  const simItems = queueInfo?.queue.filter((e): e is Extract<QueueEntry, { kind: 'item' }> => e.kind === 'item' && e.match?.block === 'sim') ?? [];
  const simStarted = simItems.some((e) => queueInfo!.states.get(e.id)?.startedAt !== undefined);
  const teamsLocked = simStarted || (!!training.simTeams && training.simSplit !== 'manual');
  const firstSim = queueInfo && simItems.length ? queueInfo.queue.indexOf(simItems[0]) : -1;
  // Simulace je na řadě: všechno před ní už je zahájené → panel týmů se sám rozbalí.
  // Panel „Týmy pro simulaci“ u sekce simulace (organizátor, dokud simulace nezačala).
  const simSetupNode = (open: boolean) =>
    manage && schedule?.teams && !teamsLocked ? (
      <details className="sim-setup no-print" open={open}>
        <summary>
          <strong>Týmy pro simulaci</strong>: {SPLIT_TEXT[training.simSplit]}
          <span className="muted"> – nastav před zahájením simulace</span>
        </summary>
        <OrderTeamsFields training={training} currentTeams={schedule.teams} players={store.data.players} onChange={apply} />
      </details>
    ) : null;
  const simNext =
    firstSim >= 0 &&
    !simStarted &&
    queueInfo!.queue.slice(0, firstSim).every((e) => e.kind === 'pause' || queueInfo!.states.get(e.id)?.startedAt !== undefined);
  const simSetup = simSetupNode(simNext);
  /** PRD 4.8: Zahájit / Ukončit u každého utkání; skóre jde zadat až po zahájení. */
  const itemTiming: ItemTiming | undefined = queueInfo
    ? {
        state: (id) => queueInfo.states.get(id),
        now: tick,
        canWrite: (_id, players, m) => (m ? canMatch(m) : manage || (!!viewer.playerId && players.includes(viewer.playerId))),
        startAny: manage,
        start: (id) => store.setPlayTime(training.id, id, { startedAt: Date.now() }),
        end: (id) => store.setPlayTime(training.id, id, { startedAt: training.playTimes?.[id]?.startedAt ?? Date.now(), endedAt: Date.now() }),
      }
    : undefined;

  /** Pokus cvičení ✓ / ✗: zamkne kolo (jako zápis výsledku) a přičte. */
  const onTapSolo: TapSolo = (playerId, key, def, ok, delta) => {
    const next = withLocked(training, parseSoloKey(key).round || null);
    if (next !== training) persistLock(next);
    store.tapSolo(training.id, playerId, key, def, ok, delta);
  };

  const tap = {
    me: viewer.playerId,
    onTapSolo,
    onBumpScore: (m: Match, field: keyof Score, delta: number) => {
      lockForMatch(m.id);
      syncEnd(m, bump(m, training.scores[m.id] ?? {}, field, delta));
      store.bumpScore(training.id, m, field, delta);
    },
    onBumpSolo: (playerId: PlayerId, key: SoloKey, delta: number, max: number) => {
      const next = withLocked(training, parseSoloKey(key).round || null);
      if (next !== training) persistLock(next);
      store.bumpSolo(training.id, playerId, key, delta, max);
    },
  };

  /** Konfigurovatelný trénink: zápis výsledku zamkne kola až po to, do kterého patří (PRD 4.6). */
  const withLocked = (t: Training, roundNo: number | null): Training => {
    if (t.format !== 'custom' || !schedule || !roundNo || roundNo <= t.lockedRounds.length) return t;
    return { ...t, lockedRounds: lockThrough(schedule, t.lockedRounds, roundNo) };
  };


  return (
    <section>
      <button type="button" className="back no-print" onClick={() => navigate({ page: 'trainings' })}>
        Zpět na tréninky
      </button>
      <h1>{formatDateLong(training.date)}</h1>
      <div className="training-head">
        <p className="dateline">
          {MODE_LABEL[training.mode]}, {training.attendees.length} {plural(training.attendees.length, 'hráč', 'hráči', 'hráčů')}, {training.tables}{' '}
          {plural(training.tables, 'stůl', 'stoly', 'stolů')}
          {training.format === 'custom' && `, ${Math.floor(training.durationMin / 60)}:${String(training.durationMin % 60).padStart(2, '0')}`}
        </p>
        {manage && (
          <button type="button" className="ghost no-print" onClick={() => navigate({ page: 'training-edit', id: training.id })}>
            Upravit nastavení
          </button>
        )}
      </div>
      {!schedule && (
        <p className="note">
          Na rozpis je potřeba víc přítomných.{manage ? ' Doplň je v nastavení.' : ''}
        </p>
      )}


      {schedule && (
        <div className="tabs no-print" role="tablist" aria-label="Zobrazení">
          {attends && (
            <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>
              Můj stůl
            </button>
          )}
          <button type="button" role="tab" aria-selected={tab === 'active'} onClick={() => setTab('active')}>
            Aktivní utkání
          </button>
          <button type="button" role="tab" aria-selected={tab === 'all' || (tab === 'mine' && !attends)} onClick={() => setTab('all')}>
            Celý rozpis
          </button>
        </div>
      )}

      {schedule && queueInfo && (
        <FlowBar
          queue={queueInfo.queue}
          states={queueInfo.states}
          pauses={pauseStates(queueInfo.queue, training.playTimes ?? {}, tick)}
          now={tick}
          started={[...queueInfo.states.values()].some((s) => s.startedAt !== undefined) || training.playTimes?.[TRAINING_ITEM] !== undefined}
          manage={manage}
          onStartTraining={() => store.setPlayTime(training.id, TRAINING_ITEM, { startedAt: Date.now() })}
          onStartPause={(id) => store.setPlayTime(training.id, id, { startedAt: Date.now() })}
          onNextRound={(id) => store.setPlayTime(training.id, id, { ...training.playTimes?.[id], endedAt: Date.now() })}
        />
      )}

      {tab === 'active' && simNext && simSetup}

      {schedule && queueInfo && tab === 'active' && (
        <ActiveMatches
          queue={queueInfo.queue}
          states={queueInfo.states}
          tables={usedTables(schedule).map((j) => j + 1)}
          names={names}
          me={viewer.playerId}
          now={tick}
          canWrite={canItem}
          onStart={(e) => itemTiming?.start(e.id)}
          onEnd={(e) => itemTiming?.end(e.id)}
        />
      )}

      {schedule && attends && tab === 'mine' && (
        <MyTable
          schedule={schedule}
          training={training}
          names={names}
          playerId={viewer.playerId!}
          since={since}
          onScore={onScore}
          onSolo={onSolo}
          canMatch={canMatch}
          canSolo={canSolo}
          tap={mobile ? tap : undefined}
          timing={itemTiming}
          onTapSolo={onTapSolo}
        />
      )}

      {schedule && (tab === 'all' || (tab === 'mine' && !attends)) && (
        <>
          {mobile ? (
            <RoundCards
              schedule={schedule}
              training={training}
              names={names}
              current={current}
              expanded={openKey}
              onToggle={(key) => setExpanded(openKey === key ? '' : key)}
              canMatch={canMatch}
              canSolo={canSolo}
              tap={tap}
              breaks={breakControls}
              timing={itemTiming}
              simSetup={simSetup}
            />
          ) : (
          <TrainingTable
            schedule={schedule}
            training={training}
            names={names}
            current={current}
            expanded={openKey}
            onToggle={(key) => setExpanded(openKey === key ? '' : key)}
            onScore={onScore}
            onSolo={onSolo}
            canMatch={canMatch}
            canSolo={canSolo}
            breaks={breakControls}
            timing={itemTiming}
            onTapSolo={onTapSolo}
            simSetup={simSetup}
          />
          )}
          <div className="actions-row no-print">
            {breakControls && (
              <button type="button" className="ghost" disabled={!canAddBreak} onClick={() => apply(addBreak(training))}>
                + Přidat pauzu
              </button>
            )}
            <button type="button" className="ghost" onClick={() => window.print()}>
              Vytisknout rozpis
            </button>
          </div>
          <StandingsView
            schedule={schedule}
            scores={training.scores}
            attendees={training.attendees}
            names={names}
            onClear={manage ? () => store.updateTrainingConfig({ ...training, scores: {} }) : undefined}
          />
          {delays.length > 0 && (
            <section className="delays">
              <h2>Zdržovači</h2>
              <p className="note">Čekání = od chvíle, kdy hráč mohl hrát (volní hráči i stůl), do zahájení utkání. Připisuje se všem hráčům utkání.</p>
              <DelayTable rows={delays} names={names} />
            </section>
          )}
        </>
      )}

      {manage && (
      <div className="actions-row no-print">
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (confirm('Smazat celý trénink včetně zapsaných skóre a výsledků?')) {
              store.deleteTraining(training.id);
              navigate({ page: 'trainings' });
            }
          }}
        >
          Smazat trénink
        </button>
      </div>
      )}
    </section>
  );
}
