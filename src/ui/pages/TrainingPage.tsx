import { addPlayer } from '../../domain/roster';
import { useMemo, useState } from 'react';
import { buildSchedule, canBuildSchedule } from '../../domain/schedule';
import { reconcileTeams } from '../../domain/simulation';
import { lostEntries, pruneEntries, replan, toggleAttendee, type LostEntries } from '../../domain/training';
import { lockThrough, roundOfMatch } from '../../domain/customSchedule';
import { parseSoloKey } from '../../domain/solo';
import type { Match, MatchId, PlayerId, Score, SoloKey, Training } from '../../domain/types';
import { canWriteMatch, canWriteSolo, type Viewer } from '../../domain/my';
import { MyTable } from '../components/MyTable';
import { TrainingTable } from '../components/TrainingTable';
import { currentRow, defaultOpenRow, minutesSinceStart, rowKey, useNow } from '../now';
import { StandingsView } from '../components/StandingsView';
import { TrainingSetup } from '../components/TrainingSetup';
import { formatDateLong } from '../dates';
import { MODE_LABEL, plural } from '../format';
import type { AppStore } from '../useAppState';
import type { Route } from '../useHashRoute';
import { persistPlayers } from './PlayersPage';

/** „Změna smaže skóre u N zápasů a M výsledků sólové části. Pokračovat?“ – null, když se nic nesmaže. */
export function lossMessage(lost: LostEntries): string | null {
  const n = lost.scores.length;
  const m = lost.solo.length;
  if (!n && !m) return null;
  const parts: string[] = [];
  if (n) parts.push(`skóre u ${n} ${plural(n, 'zápasu', 'zápasů', 'zápasů')}`);
  if (m) parts.push(`${m} ${plural(m, 'výsledek', 'výsledky', 'výsledků')} sólové části`);
  return `Změna smaže ${parts.join(' a ')}. Pokračovat?`;
}

const configChanged = (a: Training, b: Training) =>
  a.mode !== b.mode ||
  a.tables !== b.tables ||
  a.attendees.join() !== b.attendees.join() ||
  a.simSplit !== b.simSplit ||
  JSON.stringify(a.simTeams) !== JSON.stringify(b.simTeams) ||
  a.durationMin !== b.durationMin ||
  JSON.stringify(a.plan) !== JSON.stringify(b.plan) ||
  a.lockedRounds !== b.lockedRounds;
// Pozn.: startTime ani datum rozpis nemění, ukládají se přes saveTraining.

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
  // null = výchozí (běžící / první nevyplněný blok), '' = vše sbalené, jinak klíč řádku
  const [expanded, setExpanded] = useState<string | null>(null);
  const attends = !!training && viewer.playerId !== null && training.attendees.includes(viewer.playerId);
  const [tab, setTab] = useState<'mine' | 'all'>(() => (attends && !viewer.isAdmin ? 'mine' : 'all'));
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

  const apply = (input: Training) => {
    const changed = replan(training, input);
    let next = changed;
    if (changed.simSplit === 'manual') {
      // Ruční týmy se jen srovnají s přítomnými.
      if (changed.simTeams) next = { ...changed, simTeams: reconcileTeams(changed.simTeams, changed.attendees) };
    } else if (configChanged(training, changed) && changed.simTeams === training.simTeams) {
      // Změna sestavy odemkne zamčené týmy simulace (přepočítají se).
      next = { ...changed, simTeams: null };
    }
    const msg = lossMessage(lostEntries(training, next));
    if (msg && !confirm(msg)) return;
    if (configChanged(training, next)) {
      store.updateTrainingConfig(pruneEntries(next));
      setExpanded(null); // klíč řádku je pozice – po změně rozpisu platí výchozí rozbalení
    }
    else store.saveTraining(next);
  };

  const canMatch = (m: Match) => canWriteMatch(viewer, m, training);
  const canSolo = (group: PlayerId[], p: PlayerId) => canWriteSolo(viewer, group, p, training);
  /** Uloží zamčení kol / týmů: admin přímo, hráč přes funkci na serveru. */
  const persistLock = (next: Training) => (viewer.isAdmin ? store.saveTraining(next) : store.lockRounds(next));
  const onScore = (matchId: MatchId, sc: Score) => {
    // Jedno uložení: zamčení kol i týmů simulace (dvě by se navzájem přepsala).
    let next = withLocked(training, roundOfMatch(schedule!, matchId));
    const m = schedule!.matches.find((x) => x.id === matchId);
    // První výsledek simulace zamkne týmy, aby je pozdější opravy ligy nepřeházely.
    if (m?.block === 'sim' && !training.simTeams && training.simSplit !== 'manual' && schedule!.teams)
      next = { ...next, simTeams: schedule!.teams };
    if (next !== training) persistLock(next);
    store.saveScore(training.id, matchId, sc);
  };
  const onSolo = (playerId: PlayerId, key: SoloKey, value: number | null) => {
    const next = withLocked(training, parseSoloKey(key).round || null);
    if (next !== training) persistLock(next);
    store.saveSolo(training.id, playerId, key, value);
  };

  /** Konfigurovatelný trénink: zápis výsledku zamkne kola až po to, do kterého patří (PRD 4.6). */
  const withLocked = (t: Training, roundNo: number | null): Training => {
    if (t.format !== 'custom' || !schedule || !roundNo || roundNo <= t.lockedRounds.length) return t;
    return { ...t, lockedRounds: lockThrough(schedule, t.lockedRounds, roundNo) };
  };

  const onAddPlayer = (name: string) => {
    const newId = store.newId();
    const r = addPlayer(store.data.players, newId, name);
    if ('error' in r) return r;
    persistPlayers(store, r.players);
    apply(toggleAttendee(training, newId, r.players));
    return { id: newId };
  };

  return (
    <section>
      <button type="button" className="back no-print" onClick={() => navigate({ page: 'trainings' })}>
        Zpět na tréninky
      </button>
      <h1>{formatDateLong(training.date)}</h1>
      <p className="dateline">
        {MODE_LABEL[training.mode]}, {training.attendees.length} {plural(training.attendees.length, 'hráč', 'hráči', 'hráčů')}, {training.tables} stoly
      </p>

      {viewer.isAdmin && (
        <TrainingSetup
          training={training}
          currentTeams={schedule?.teams ?? null}
          players={store.data.players}
          onChange={apply}
          onAddPlayer={onAddPlayer}
        />
      )}

      {schedule && attends && (
        <div className="tabs no-print" role="tablist" aria-label="Zobrazení">
          <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>
            Můj stůl
          </button>
          <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>
            Celý rozpis
          </button>
        </div>
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
        />
      )}

      {schedule && (!attends || tab === 'all') && (
        <>
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
          />
          <div className="actions-row no-print">
            <button type="button" className="ghost" onClick={() => window.print()}>
              Vytisknout rozpis
            </button>
          </div>
          <StandingsView
            schedule={schedule}
            scores={training.scores}
            attendees={training.attendees}
            names={names}
            onClear={viewer.isAdmin ? () => store.updateTrainingConfig({ ...training, scores: {} }) : undefined}
          />
        </>
      )}

      {viewer.isAdmin && (
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
