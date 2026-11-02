import { useState } from 'react';
import { canManage, type Viewer } from '../../domain/my';
import { TRAINING_ITEM } from '../../domain/queue';
import { addPlayer } from '../../domain/roster';
import { newTraining, sortTrainings } from '../../domain/training';
import type { Training } from '../../domain/types';
import { TrainingWizard } from '../components/TrainingWizard';
import { nextHalfHour, todayIso } from '../dates';
import { commitEdit } from '../trainingEdit';
import type { AppStore } from '../useAppState';
import type { Route } from '../useHashRoute';
import { persistPlayers } from './PlayersPage';

/** Přidá hráče do soupisky (průvodce ho pak zaškrtne). */
const rosterAdd = (store: AppStore) => (name: string) => {
  const id = store.newId();
  const r = addPlayer(store.data.players, id, name);
  if ('error' in r) return r;
  persistPlayers(store, r.players);
  return { id, players: r.players };
};

/** Nový trénink v krocích; uloží se a rovnou zahájí až tlačítkem „Zahájit trénink“. */
export function NewTrainingPage({ store, navigate, viewer }: { store: AppStore; navigate(r: Route): void; viewer: Viewer }) {
  const [initial] = useState<Training>(() => ({
    ...newTraining(store.newId(), todayIso(), sortTrainings(store.data.trainings)[0] ?? null, viewer.playerId),
    startTime: nextHalfHour(new Date()), // aktuální čas zaokrouhlený na 30 min nahoru
  }));
  return (
    <TrainingWizard
      initial={initial}
      mode="new"
      players={store.data.players}
      onAddPlayer={rosterAdd(store)}
      onCancel={() => navigate({ page: 'trainings' })}
      onFinish={(t) => {
        store.saveTraining(t);
        store.setPlayTime(t.id, TRAINING_ITEM, { startedAt: Date.now() });
        navigate({ page: 'training', id: t.id });
      }}
    />
  );
}

/** Úprava nastavení existujícího tréninku (správce): stejný průvodce, „Uložit změny“ kdykoli. */
export function EditTrainingPage({ store, id, navigate, viewer }: { store: AppStore; id: string; navigate(r: Route): void; viewer: Viewer }) {
  const training = store.data.trainings.find((t) => t.id === id);
  if (!training) return <p>Trénink nenalezen.</p>;
  if (!canManage(viewer, training)) return <p>Nastavení tréninku může měnit jen jeho zakladatel nebo admin.</p>;
  return (
    <TrainingWizard
      initial={training}
      mode="edit"
      players={store.data.players}
      onAddPlayer={rosterAdd(store)}
      onCancel={() => navigate({ page: 'training', id })}
      onFinish={(t) => {
        if (commitEdit(store, training, t)) navigate({ page: 'training', id });
      }}
    />
  );
}
