import { useState } from 'react';
import { sortTrainings } from '../../domain/training';
import { clubTrainings, practiceMatches, practiceMinutes, practiceRunning, practiceSeries, practicesFor } from '../../domain/practice';
import { formatDateLong } from '../dates';
import { MODE_LABEL, plural } from '../format';
import { canCreateTraining, type Viewer } from '../../domain/my';
import type { Training } from '../../domain/types';
import type { AppStore } from '../useAppState';
import type { Route } from '../useHashRoute';
import { useNow } from '../now';
import { liveTag } from '../liveTag';

/** Kolik vlastních tréninků je vidět bez rozbalení. */
const PRACTICE_PREVIEW = 3;

/** PRD 5.11: karta Vlastní trénink a seznam vlastních tréninků (hráč své, admin všechny). */
function Practices({ store, navigate, viewer, now }: { store: AppStore; navigate: (r: Route) => void; viewer: Viewer; now: number }) {
  const [all, setAll] = useState(false);
  const names = new Map(store.data.players.map((p) => [p.id, p.name]));
  const list = practicesFor(store.data.trainings, viewer.playerId, viewer.isAdmin);
  const running = list.find((t) => viewer.playerId && t.attendees.includes(viewer.playerId) && practiceRunning(t, now));
  const shown = all ? list : list.slice(0, PRACTICE_PREVIEW);
  const who = (t: Training) => {
    const others = t.attendees.filter((p) => p !== viewer.playerId);
    if (!viewer.playerId || !t.attendees.includes(viewer.playerId)) return t.attendees.map((p) => names.get(p) ?? '?').join(' a ');
    return others.length ? `s ${others.map((p) => names.get(p) ?? '?').join(', ')}` : 'sám';
  };
  return (
    <>
      <section className="practice-card" aria-label="Vlastní trénink">
        <div>
          <strong>Vlastní trénink</strong>
          <span className="note">Sám nebo ve dvou, kdykoli u stolu. Výsledky jdou do žebříčku Vlastní.</span>
        </div>
        {viewer.playerId &&
          (running ? (
            <button type="button" onClick={() => navigate({ page: 'practice', id: running.id })}>
              Pokračovat ve vlastním tréninku
            </button>
          ) : (
            <button type="button" onClick={() => navigate({ page: 'practice-new' })}>
              Začít vlastní trénink
            </button>
          ))}
      </section>
      {list.length > 0 && (
        <>
          <h2>{viewer.isAdmin ? 'Vlastní tréninky hráčů' : 'Moje vlastní tréninky'}</h2>
          <ul className="training-list" aria-label="Vlastní tréninky">
            {shown.map((t) => {
              const n = practiceSeries(t).length;
              const g = practiceMatches(t).length;
              const min = practiceMinutes(t);
              const live = practiceRunning(t, now);
              return (
                <li key={t.id} className={live ? 'today' : undefined}>
                  <button type="button" onClick={() => navigate({ page: 'practice', id: t.id })}>
                    {live && <span className="live-tag">Běží</span>}
                    <span>{formatDateLong(t.date)}</span>
                    <span className="sub">
                      {who(t)}
                      {min !== null ? ` · ${min} min` : ''}
                      {n || !g ? ` · ${n} ${plural(n, 'série', 'série', 'sérií')}` : ''}
                      {g ? ` · ${g} ${plural(g, 'zápas', 'zápasy', 'zápasů')}` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {list.length > PRACTICE_PREVIEW && (
            <button type="button" className="ghost" onClick={() => setAll(!all)}>
              {all ? 'Méně' : `Všechny (${list.length})`}
            </button>
          )}
        </>
      )}
    </>
  );
}

export function TrainingsPage({ store, navigate, viewer }: { store: AppStore; navigate: (r: Route) => void; viewer: Viewer }) {
  const trainings = sortTrainings(clubTrainings(store.data.trainings));
  const now = useNow();
  const names = new Map(store.data.players.map((p) => [p.id, p.name]));

  const create = () => navigate({ page: 'training-new' });

  return (
    <section>
      <h1>Trénink</h1>
      {canCreateTraining(viewer) && (
        <div className="actions-row">
          <button type="button" className="fab" onClick={create}>
            <span aria-hidden="true">+ </span>Nový trénink
          </button>
        </div>
      )}
      <Practices store={store} navigate={navigate} viewer={viewer} now={now.getTime()} />
      <h2>Klubové tréninky</h2>
      {trainings.length === 0 ? (
        <p className="note">
          {canCreateTraining(viewer) ? 'Zatím žádný trénink. Začni tlačítkem Nový trénink.' : 'Zatím žádný trénink. Zakládá je admin nebo organizátor.'}
        </p>
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
