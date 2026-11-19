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
import { Seg } from '../components/Seg';
import type { UiPrefs } from '../../storage/prefs';

/**
 * PRD 5.11: vlastní tréninky (hráč své, admin všechny) – část Vlastní stránky Tréninky; tlačítko „+ Vlastní trénink“
 * (nebo Pokračovat, když jeden běží).
 */
function Practices({ store, navigate, viewer, now }: { store: AppStore; navigate: (r: Route) => void; viewer: Viewer; now: number }) {
  const names = new Map(store.data.players.map((p) => [p.id, p.name]));
  const list = practicesFor(store.data.trainings, viewer.playerId, viewer.isAdmin);
  const running = list.find((t) => viewer.playerId && t.attendees.includes(viewer.playerId) && practiceRunning(t, now));
  const who = (t: Training) => {
    const others = t.attendees.filter((p) => p !== viewer.playerId);
    if (!viewer.playerId || !t.attendees.includes(viewer.playerId)) return t.attendees.map((p) => names.get(p) ?? '?').join(' a ');
    return others.length ? `s ${others.map((p) => names.get(p) ?? '?').join(', ')}` : 'sám';
  };
  return (
    <>
      {viewer.playerId && (
        <div className="actions-row">
          {running ? (
            <button type="button" className="fab" onClick={() => navigate({ page: 'practice', id: running.id })}>
              Pokračovat ve vlastním tréninku
            </button>
          ) : (
            <button type="button" className="fab" onClick={() => navigate({ page: 'practice-new' })}>
              <span aria-hidden="true">+ </span>Vlastní trénink
            </button>
          )}
        </div>
      )}
      <p className="note">Sám nebo ve dvou, kdykoli u stolu. Výsledky jdou do žebříčku: cvičení do Cvičení, zápasy do Zápasů podle disciplín.</p>
      {list.length === 0 ? (
        <p className="note">Zatím žádný vlastní trénink.</p>
      ) : (
        <ul className="training-list" aria-label="Vlastní tréninky">
          {list.map((t) => {
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
      )}
    </>
  );
}

/**
 * Stránka Tréninky (19. 11. 2026, *rozhodnutí uživatele*, návrh C): přepínač Klubové / Vlastní (pamatuje si ho
 * zařízení, výchozí Klubové) a jedno tlačítko podle zvolené části – „+ Klubový trénink“ (admin / organizátor)
 * nebo „+ Vlastní trénink“.
 */
export function TrainingsPage({
  store,
  navigate,
  viewer,
  prefs,
  setPrefs,
}: {
  store: AppStore;
  navigate: (r: Route) => void;
  viewer: Viewer;
  prefs: UiPrefs;
  setPrefs(p: UiPrefs): void;
}) {
  const trainings = sortTrainings(clubTrainings(store.data.trainings));
  const now = useNow();
  const names = new Map(store.data.players.map((p) => [p.id, p.name]));
  const part = prefs.trainingsPart ?? 'club';
  const own = practicesFor(store.data.trainings, viewer.playerId, viewer.isAdmin).length;

  return (
    <section>
      <h1>Tréninky</h1>
      <Seg<'club' | 'own'>
        label="Tréninky"
        value={part}
        onChange={(v) => setPrefs({ ...prefs, trainingsPart: v })}
        options={[
          ['club', 'Klubové'],
          ['own', own ? `Vlastní (${own})` : 'Vlastní'],
        ]}
      />
      {part === 'own' ? (
        <Practices store={store} navigate={navigate} viewer={viewer} now={now.getTime()} />
      ) : (
        <>
          {canCreateTraining(viewer) && (
            <div className="actions-row">
              <button type="button" className="fab" onClick={() => navigate({ page: 'training-new' })}>
                <span aria-hidden="true">+ </span>Klubový trénink
              </button>
            </div>
          )}
          {trainings.length === 0 ? (
            <p className="note">
              {canCreateTraining(viewer) ? 'Zatím žádný trénink. Začni tlačítkem Klubový trénink.' : 'Zatím žádný trénink. Zakládá je admin nebo organizátor.'}
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
        </>
      )}
    </section>
  );
}
