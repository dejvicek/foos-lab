import { useState } from 'react';
import { canCreateTraining, canManage, type Viewer } from '../../domain/my';
import { TRAINING_ITEM, trainingStarted } from '../../domain/queue';
import { addPlayer } from '../../domain/roster';
import { newTraining, sortTrainings, templateFromTraining } from '../../domain/training';
import { addTemplate } from '../../domain/catalog';
import { catalogMins } from '../../domain/disciplines';
import type { Training } from '../../domain/types';
import { TrainingWizard } from '../components/TrainingWizard';
import { nextHalfHour, todayIso } from '../dates';
import { commitEdit, commitRegenerate } from '../trainingEdit';
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

/** Admin: nastavení disciplín jako nová šablona (10. 11. 2026); ostatní tlačítko nevidí. */
const templateSaver = (store: AppStore, viewer: Viewer) =>
  viewer.isAdmin
    ? (name: string, t: Training) => {
        const r = addTemplate(store.data.catalog ?? {}, templateFromTraining(t, store.newId(), name));
        if ('error' in r) return r.error;
        store.saveCatalog(r);
        return null;
      }
    : undefined;

/** Nový trénink v krocích; uloží se a rovnou zahájí až tlačítkem „Zahájit trénink“. */
export function NewTrainingPage({ store, navigate, viewer }: { store: AppStore; navigate(r: Route): void; viewer: Viewer }) {
  const [initial] = useState<Training>(() => ({
    ...newTraining(store.newId(), todayIso(), sortTrainings(store.data.trainings)[0] ?? null, viewer.playerId),
    startTime: nextHalfHour(new Date()), // aktuální čas zaokrouhlený na 30 min nahoru
  }));
  if (!canCreateTraining(viewer)) return <p>Zakládat tréninky smí jen admin a organizátoři. Organizátora nastavuje admin na stránce Hráči.</p>;
  return (
    <TrainingWizard
      initial={initial}
      mode="new"
      players={store.data.players}
      trainings={store.data.trainings}
      onAddPlayer={rosterAdd(store)}
      onSaveTemplate={templateSaver(store, viewer)}
      onCancel={() => navigate({ page: 'trainings' })}
      onFinish={(t) => {
        store.saveTraining(t);
        store.startItem(t.id, TRAINING_ITEM);
        navigate({ page: 'training', id: t.id });
      }}
    />
  );
}

/** Úprava nastavení existujícího tréninku (správce): stejný průvodce, „Uložit změny“ kdykoli. */
export function EditTrainingPage({ store, id, navigate, viewer }: { store: AppStore; id: string; navigate(r: Route): void; viewer: Viewer }) {
  const training = store.data.trainings.find((t) => t.id === id);
  if (!training) return <p>Trénink nenalezen.</p>;
  if (!canManage(viewer, training)) return <p>Nastavení tréninku může měnit jen admin nebo organizátor, který trénink založil.</p>;
  // Běžící trénink jde upravit, ale uložená změna přegeneruje celý rozpis (10. 11. 2026): náhled bez
  // zamčených kol, délky kol tréninku zůstávají. Nezahájený si vezme aktuální délky kol z katalogu (PRD 4.6).
  const running = trainingStarted(training);
  return (
    <TrainingWizard
      initial={running ? { ...training, lockedRounds: [] } : { ...training, disciplineMin: catalogMins() }}
      mode="edit"
      running={running}
      players={store.data.players}
      trainings={store.data.trainings}
      onAddPlayer={rosterAdd(store)}
      onSaveTemplate={templateSaver(store, viewer)}
      onCancel={() => navigate({ page: 'training', id })}
      onFinish={(t) => {
        if (running ? commitRegenerate(store, training, t) : commitEdit(store, training, t)) navigate({ page: 'training', id });
      }}
    />
  );
}
