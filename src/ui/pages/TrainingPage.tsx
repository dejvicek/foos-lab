import { useMemo, useState, type ReactNode } from 'react';
import { buildSchedule, canBuildSchedule } from '../../domain/schedule';
import { commitEdit, configChanged, prepareEdit } from '../trainingEdit';
import { SimTeamsFields, SPLIT_TEXT } from '../components/TrainingSetup';
import { lockThrough, roundOfMatch } from '../../domain/customSchedule';
import { parseSoloKey, soloKey } from '../../domain/solo';
import { tapDrill } from '../../domain/drillTap';
import { bump } from '../../domain/legState';
import type { Match, MatchId, PlayerId, Score, SoloKey, Training } from '../../domain/types';
import { canManage, canWriteMatch, canWriteSolo, type Viewer } from '../../domain/my';
import { MyTable } from '../components/MyTable';
import { TrainingTable, type BreakControls } from '../components/TrainingTable';
import { addBreak, breakMovable, breaksOf, freeSlots, moveBreak, removeBreak, setBreakMin, stepTarget } from '../../domain/breaks';
import { RoundCards } from '../components/RoundCards';
import type { TapSolo } from '../components/BlockEntry';
import { useMobile } from '../useMobile';
import { ActiveMatches } from '../components/ActiveMatches';
import { currentPause, FlowBar, PauseInline } from '../components/FlowBar';
import { DelayTable, type ItemTiming } from '../components/Timing';
import { delayStats, drillItemId, pauseStates, TRAINING_ITEM, trainingStarted, type QueueEntry } from '../../domain/queue';
import { trainingQueue, useTick } from '../queue';
import { usedTables } from '../components/TrainingTable';
import { defaultOpenRow, minutesSinceStart, rowKey, useNow } from '../now';
import { pauseRows, playingRow, roundStates } from '../roundState';
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
  view = 'schedule',
}: {
  store: AppStore;
  id: string;
  navigate: (r: Route) => void;
  viewer?: Viewer;
  /** schedule = stránka tréninku (rozpis, souhrn), live = Živě, my = Moje hry (hlavní navigace). */
  view?: 'schedule' | 'live' | 'my';
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
  // Stopky běží jen na obrazovkách, kde jsou vidět (Moje hry, Živě).
  // V rozpisu stačí obnova po 30 s (stav kol, „hraje se X min“); během pauzy po sekundě (odpočet v řádku pauzy).
  const pauseRunning = Object.entries(training?.playTimes ?? {}).some(
    ([k, v]) => k.startsWith('pause|') && v.startedAt !== undefined && v.endedAt === undefined && v.startedAt > Date.now() - 60 * 60_000,
  );
  const tick = useTick(view === 'schedule' && !pauseRunning ? 30_000 : 1000, !!training);
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

  // Moje hry: výchozí kolo pro hráče bez aktivní hry (podle hodin).
  const since = minutesSinceStart(training.date, training.startTime, now);
  const rounds = schedule && queueInfo ? roundStates(schedule, queueInfo.states, pauseStates(queueInfo.queue, training.playTimes ?? {}, Math.max(tick, Date.now()))) : null;
  const fallback = schedule ? defaultOpenRow(schedule, training, playingRow(schedule, rounds)) : null;
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
  const onScore = (matchId: MatchId, sc: Score) => {
    lockForMatch(matchId);
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
        <SimTeamsFields training={training} currentTeams={schedule.teams} players={store.data.players} onChange={apply} />
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
        allowStart: view === 'my',
        manage,
        start: (id) => store.setPlayTime(training.id, id, { startedAt: Date.now() }),
        // Konec vždy potvrzuje člověk. Nezahájené utkání potvrzené organizátorem se počítá od vypsání.
        end: (id) => {
          const now = Date.now();
          const startedAt = training.playTimes?.[id]?.startedAt ?? queueInfo.states.get(id)?.activeAt ?? now;
          store.setPlayTime(training.id, id, { startedAt: Math.min(startedAt, now), endedAt: now });
        },
      }
    : undefined;

  /** ID utkání cvičení (stůl, kde hráč s danou metrikou a kolem cvičí). */
  const drillItemOf = (playerId: PlayerId, key: SoloKey): string | null => {
    for (const sec of schedule?.sections ?? [])
      for (const r of sec.rows)
        for (const [j, c] of r.cells.entries())
          if (c?.type === 'group' && c.metric && c.players.includes(playerId) && soloKey(c.metric, c.soloRound) === key) return drillItemId(r, j + 1, c.players);
    return null;
  };
  /** Pokus cvičení ✓ / ✗: zamkne kolo (jako zápis výsledku) a přičte. */
  const onTapSolo: TapSolo = (playerId, key, def, ok, delta) => {
    const next = withLocked(training, parseSoloKey(key).round || null);
    if (next !== training) persistLock(next);
    // Průběh cvičení: pokus jako událost (u stolu, kde hráč se skupinou cvičí).
    const valid = tapDrill({ value: training.soloResults[playerId]?.[key], attempts: training.soloAttempts?.[playerId]?.[key] }, def, ok, delta);
    const itemId = drillItemOf(playerId, key);
    if (valid && itemId)
      store.addEvent(training.id, { id: store.newId(), itemId, at: Date.now(), kind: ok ? 'hit' : 'miss', playerId, delta });
    store.tapSolo(training.id, playerId, key, def, ok, delta);
  };

  const tap = {
    me: viewer.playerId,
    onTapSolo,
    onBumpScore: (m: Match, field: keyof Score, delta: number) => {
      lockForMatch(m.id);
      // Průběh hry: ťuknutí jako událost (jen když se hodnota opravdu změní – strop / nula se nezapíše).
      const cur = training.scores[m.id] ?? {};
      if ((bump(m, cur, field, delta)[field] ?? 0) !== (cur[field] ?? 0))
        store.addEvent(training.id, {
          id: store.newId(),
          itemId: m.id,
          at: Date.now(),
          kind: field === 'ga' || field === 'gb' ? 'goal' : 'loss',
          side: field === 'ga' || field === 'la' ? 'A' : 'B',
          delta: delta > 0 ? 1 : -1,
        });
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


  const pauseNow = Math.max(tick, Date.now());
  const pauseList = queueInfo ? pauseStates(queueInfo.queue, training.playTimes ?? {}, pauseNow) : [];
  const onStartPause = (id: string) => store.setPlayTime(training.id, id, { startedAt: Date.now() });
  const onNextRound = (id: string) => store.setPlayTime(training.id, id, { ...training.playTimes?.[id], endedAt: Date.now() });
  /** Trénink tab: ovládání pauzy v jejím řádku rozpisu (ne v liště nahoře). */
  const pauseSlots = new Map<string, ReactNode>();
  if (schedule && queueInfo && rounds) {
    const cur = currentPause(queueInfo.queue, queueInfo.states, pauseList);
    for (const [key, k] of pauseRows(schedule)) {
      const p = pauseList[k];
      if (p)
        pauseSlots.set(key, <PauseInline p={p} current={cur?.id === p.id} now={pauseNow} manage={manage} onStartPause={onStartPause} onNextRound={onNextRound} />);
    }
  }
  const flowBar = (showPause: boolean) => schedule && queueInfo && (
    <FlowBar
      showPause={showPause}
      queue={queueInfo.queue}
      states={queueInfo.states}
      pauses={pauseStates(queueInfo.queue, training.playTimes ?? {}, tick)}
      now={tick}
      started={[...queueInfo.states.values()].some((s) => s.startedAt !== undefined) || training.playTimes?.[TRAINING_ITEM] !== undefined}
      manage={manage}
      onStartTraining={() => store.setPlayTime(training.id, TRAINING_ITEM, { startedAt: Date.now() })}
      onStartPause={onStartPause}
      onNextRound={onNextRound}
    />
  );
  const viewHead = (title: string) => (
    <div className="view-head">
      <h1>{title}</h1>
      <span className="muted">{formatDateLong(training.date)}</span>
      <button type="button" className="link" onClick={() => navigate({ page: 'training', id: training.id })}>
        celý rozpis ›
      </button>
    </div>
  );

  if (view === 'live')
    return (
      <section>
        {viewHead('Živě')}
        {flowBar(true)}
        {simNext && simSetup}
        {schedule && queueInfo && (
          <ActiveMatches
            queue={queueInfo.queue}
            states={queueInfo.states}
            tables={usedTables(schedule).map((j) => j + 1)}
            names={names}
            me={viewer.playerId}
            now={tick}
            canWrite={canItem}
            manage={manage}
            onEnd={(e) => itemTiming?.end(e.id)}
            onMyGame={attends ? () => navigate({ page: 'my' }) : undefined}
          />
        )}
      </section>
    );

  if (view === 'my')
    return (
      <section className="view-my">
        {viewHead('Moje hry')}
        {schedule && attends ? (
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
        ) : (
          <p className="note">V tomhle tréninku nehraješ.</p>
        )}
      </section>
    );

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
        {manage &&
          (trainingStarted(training) ? (
            <span className="muted no-print">Trénink běží – nastavení už nejde měnit.</span>
          ) : (
            <button type="button" className="ghost no-print" onClick={() => navigate({ page: 'training-edit', id: training.id })}>
              Upravit nastavení
            </button>
          ))}
      </div>
      {!schedule && (
        <p className="note">
          Na rozpis je potřeba víc přítomných.{manage ? ' Doplň je v nastavení.' : ''}
        </p>
      )}


      {flowBar(false)}

      {schedule && (
        <>
          {mobile ? (
            <RoundCards
              schedule={schedule}
              training={training}
              names={names}
              rounds={rounds}
              pauseSlots={pauseSlots}
              now={tick}
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
            rounds={rounds}
              pauseSlots={pauseSlots}
              now={tick}
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
