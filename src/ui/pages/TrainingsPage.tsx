import { newTraining, sortTrainings } from '../../domain/training';
import { formatDateLong, todayIso } from '../dates';
import { MODE_LABEL, plural } from '../format';
import type { Viewer } from '../../domain/my';
import type { AppStore } from '../useAppState';
import type { Route } from '../useHashRoute';
import { liveTag, useNow } from '../now';

export function TrainingsPage({ store, navigate, viewer }: { store: AppStore; navigate: (r: Route) => void; viewer: Viewer }) {
  const trainings = sortTrainings(store.data.trainings);
  const now = useNow();
  const names = new Map(store.data.players.map((p) => [p.id, p.name]));

  const create = () => {
    const t = newTraining(store.newId(), todayIso(), trainings[0] ?? null, viewer.playerId);
    store.saveTraining(t);
    navigate({ page: 'training', id: t.id });
  };

  return (
    <section>
      <h1>Trénink</h1>
      <div className="actions-row">
        <button type="button" className="fab" onClick={create}>
          <span aria-hidden="true">+ </span>Nový trénink
        </button>
      </div>
      {trainings.length === 0 ? (
        <p className="note">Zatím žádný trénink. Začni tlačítkem Nový trénink.</p>
      ) : (
        <ul className="training-list" aria-label="Uložené tréninky">
          {trainings.map((t) => {
            const n = t.attendees.length;
            const tag = liveTag(t, viewer.playerId, now);
            return (
              <li key={t.id} className={tag ? 'today' : undefined}>
                <button type="button" onClick={() => navigate({ page: 'training', id: t.id })}>
                  {tag && <span className="live-tag">{tag}</span>}
                  <span>{formatDateLong(t.date)}</span>
                  <span className="sub">
                    {MODE_LABEL[t.mode]}, {n} {plural(n, 'hráč', 'hráči', 'hráčů')}
                    {t.createdBy && names.get(t.createdBy) ? `, založil ${names.get(t.createdBy)}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
