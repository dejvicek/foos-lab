import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { baseMatchId } from '../../domain/matchFormat';
import { autoEndIn as autoEndAfter, dueAutoEnds } from '../../domain/autoEnd';
import { buildSchedule, canBuildSchedule } from '../../domain/schedule';
import { commitEdit, configChanged, prepareEdit } from '../trainingEdit';
import { SimTeamsFields, SPLIT_TEXT } from '../components/TrainingSetup';
import { lockThrough, roundOfMatch } from '../../domain/customSchedule';
import { parseSoloKey, soloKey, soloMetric } from '../../domain/solo';
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
import { delayStats, drillItemId, pauseStates, TRAINING_ITEM, type QueueEntry } from '../../domain/queue';
import { trainingQueue, useTick } from '../queue';
import { usedTables } from '../components/TrainingTable';
import { defaultOpenRow, minutesSinceStart, rowKey, useNow } from '../now';
import { pauseRows, playingRow, roundStates } from '../roundState';
import { StandingsView } from '../components/StandingsView';
import { formatDateLong } from '../dates';
import { MODE_LABEL, plural } from '../format';
import type { AppStore } from '../useAppState';
import type { Route } from '../useHashRoute';
import { isWarmupItem, warmupRunning } from '../../domain/warmup';

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
  // Průběh her (časová osa, automatický konec utkání) se načítá jen pro trénink na obrazovce.
  const { watchEvents } = store;
  useEffect(() => watchEvents(id), [watchEvents, id]);
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
  // Běžící Rozcvička: odpočet fáze i v rozpisu po sekundě.
  const warmupLive = Object.entries(training?.playTimes ?? {}).some(
    ([k, v]) => v.startedAt !== undefined && v.endedAt === undefined && v.startedAt > Date.now() - 60 * 60_000 && !!schedule && isWarmupItem(schedule, k),
  );
  // Dohraný výsledek čeká na potvrzení nejdéle 15 s – odpočet po sekundě i v rozpisu.
  const autoLive = !!training && !!schedule && Object.keys(training.playTimes ?? {}).some((k) => autoEndAfter(training, schedule, k, Date.now()) !== null);
  const tick = useTick(view === 'schedule' && !pauseRunning && !warmupLive && !autoLive ? 30_000 : 1000, !!training);
  // Po vlastní změně (Ukončit) přepočítat hned, ne až s dalším tikem stopek.
  const queueInfo = useMemo(() => (training && schedule ? trainingQueue(training, Math.max(tick, Date.now()), schedule) : null), [training, schedule, tick]);
  // Dohraný výsledek bez potvrzení: po 15 s od posledního ťuknutí utkání skončí samo (10. 11. 2026).
  // Zapíše ho kterýkoli otevřený telefon s právem zápisu; konec = poslední ťuknutí + 15 s.
  const autoSent = useRef(new Set<string>());
  useEffect(() => {
    if (!training || !schedule || !queueInfo) return;
    for (const e of dueAutoEnds(training, schedule, Math.max(tick, Date.now()))) {
      const item = queueInfo.queue.find((q) => q.kind === 'item' && q.id === e.id);
      if (!item || item.kind !== 'item' || autoSent.current.has(e.id)) continue;
      const may = item.match
        ? canWriteMatch(viewer, item.match, training)
        : canManage(viewer, training) || (!!viewer.playerId && item.players.includes(viewer.playerId));
      if (!may) continue;
      autoSent.current.add(e.id);
      store.endItem(training.id, e.id, { startedAt: e.startedAt, endedAt: e.endedAt });
    }
  }, [training, schedule, queueInfo, tick]);
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
  /**
   * Uloží zamčení kol / týmů – vždy jen je (funkce lock_rounds: kola se jen prodlužují). Dřív organizátor
   * ukládal celý řádek tréninku a zařízení se zastaralým stavem tím mohlo vrátit cizí změnu nastavení.
   */
  const persistLock = (next: Training) => store.lockRounds(next);
  /** Před zápisem výsledku zamkne kola (a týmy simulace) – jedno uložení, jinak by se přepsala. */
  const lockForMatch = (matchId: MatchId) => {
    let next = withLocked(training, roundOfMatch(schedule!, matchId));
    const m = schedule!.matches.find((x) => x.id === baseMatchId(matchId));
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
          <span>
            <strong>Týmy pro simulaci</strong>: {SPLIT_TEXT[training.simSplit]}
            <span className="muted"> – nastav před zahájením simulace</span>
          </span>
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
        autoEndIn: (id) => (schedule ? autoEndAfter(training, schedule, id, Math.max(tick, Date.now())) : null),
        start: (id) => store.startItem(training.id, id),
        // Konec potvrzuje člověk (dohraný výsledek nejdéle 15 s, pak skončí sám). Nezahájené utkání potvrzené organizátorem se počítá od vypsání.
        end: (id) => {
          const now = Date.now();
          // Rozcvička: timer ještě běží → ukončit jen po potvrzení.
          if (warmupRunning(schedule!, id, training.playTimes?.[id]?.startedAt, now) && !confirm('Rozcvička ještě běží – opravdu ukončit?')) return;
          // Nezahájené utkání (potvrzuje organizátor) se počítá od chvíle, kdy bylo na řadě.
          store.endItem(training.id, id, { startedAt: queueInfo.states.get(id)?.activeAt ?? now, endedAt: now });
        },
      }
    : undefined;

  /** Živě: metrika a klíč výsledku cvičení podle kola, stolu a hráčů ve frontě. */
  const drillEntryOf = (label: string, table: number, players: PlayerId[]) => {
    for (const sec of schedule?.sections ?? [])
      for (const r of sec.rows) {
        if (r.label !== label) continue;
        const c = r.cells[table - 1];
        if (c?.type === 'group' && c.metric && c.players.join() === players.join()) return { def: soloMetric(c.metric), key: soloKey(c.metric, c.soloRound) };
      }
    return null;
  };
  /** ID utkání cvičení (stůl, kde hráč s danou metrikou a kolem cvičí). */
  const drillItemOf = (playerId: PlayerId, key: SoloKey): string | null => {
    for (const sec of schedule?.sections ?? [])
      for (const r of sec.rows)
        for (const [j, c] of r.cells.entries())
          if (c?.type === 'group' && c.metric && c.players.includes(playerId) && soloKey(c.metric, c.soloRound) === key) return drillItemId(r, j + 1, c.players);
    return null;
  };
  /** Pokus cvičení ✓ / ✗: zamkne kolo (jako zápis výsledku) a přičte; pokus je i událost průběhu u svého stolu. */
  const onTapSolo: TapSolo = (playerId, key, def, ok, delta) => {
    const next = withLocked(training, parseSoloKey(key).round || null);
    if (next !== training) persistLock(next);
    store.tapSolo(training.id, playerId, key, def, ok, delta, drillItemOf(playerId, key) ?? `solo|${playerId}|${key}`);
  };

  const tap = {
    me: viewer.playerId,
    onTapSolo,
    // Ťuknutí = přičtení i událost průběhu hry (jen když se hodnota opravdu změní – strop / nula se nezapíše).
    onBumpScore: (m: Match, field: keyof Score, delta: number) => {
      lockForMatch(m.id);
      store.bumpScore(training.id, m, field, delta);
    },
  };

  /** Konfigurovatelný trénink: zápis výsledku zamkne kola až po to, do kterého patří (PRD 4.6). */
  const withLocked = (t: Training, roundNo: number | null): Training => {
    if (t.format !== 'custom' || !schedule || !roundNo || roundNo <= t.lockedRounds.length) return t;
    return { ...t, lockedRounds: lockThrough(schedule, t.lockedRounds, roundNo) };
  };


  const pauseNow = Math.max(tick, Date.now());
  const pauseList = queueInfo ? pauseStates(queueInfo.queue, training.playTimes ?? {}, pauseNow) : [];
  const onStartPause = (id: string) => store.startItem(training.id, id);
  const onNextRound = (id: string) => store.endItem(training.id, id);
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
      onStartTraining={() => store.startItem(training.id, TRAINING_ITEM)}
      onStartPause={onStartPause}
      onNextRound={onNextRound}
    />
  );
  // Moje hry bez odkazu na celý rozpis – stačí Trénink v navigaci (na telefonu se nevešel).
  const viewHead = (title: string, scheduleLink = true) => (
    <div className="view-head">
      <h1>{title}</h1>
      <span className="muted">{formatDateLong(training.date)}</span>
      {scheduleLink && (
        <button type="button" className="link" onClick={() => navigate({ page: 'training', id: training.id })}>
          celý rozpis ›
        </button>
      )}
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
            entry={{ training, onScore, onSolo, drillOf: (e) => drillEntryOf(e.label, e.table, e.players) }}
            onMyGame={attends ? () => navigate({ page: 'my' }) : undefined}
          />
        )}
      </section>
    );

  if (view === 'my')
    return (
      <section className="view-my">
        {viewHead('Moje hry', false)}
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
