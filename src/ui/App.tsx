import { activeFor } from './active';
import { useNow } from './now';
import { EditTrainingPage, NewTrainingPage } from './pages/TrainingWizardPages';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Viewer } from '../domain/my';
import { memoryAuth, type AuthService, type Me } from '../storage/auth';
import { loadPrefs, savePrefs, type UiPrefs } from '../storage/prefs';
import type { Repository } from '../storage/repository';
import { MainNav } from './components/MainNav';
import { LadderPage } from './pages/LadderPage';
import { ChangePasswordPage, LoginPage } from './pages/LoginPage';
import { PlayerPage } from './pages/PlayerPage';
import { PlayersPage } from './pages/PlayersPage';
import { TrainingPage } from './pages/TrainingPage';
import { TrainingsPage } from './pages/TrainingsPage';
import { useAppState } from './useAppState';
import { useHashRoute } from './useHashRoute';

const defaultAuth = memoryAuth();

/** PRD 4.7: bez přihlášení jen přihlašovací obrazovka, po prvním přihlášení vynucená změna hesla. */
export function App({ repo, auth = defaultAuth }: { repo: Repository; auth?: AuthService }) {
  const [me, setMe] = useState<Me | null | 'loading'>('loading');
  const [nick, setNick] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    let alive = true;
    auth.current().then(
      (m) => alive && setMe(m),
      () => alive && setMe(null),
    );
    return () => {
      alive = false;
    };
  }, [auth]);

  if (me === 'loading') return <main className="page"><p className="note">Načítám…</p></main>;
  if (!me) return <LoginPage auth={auth} onDone={(m, n) => (setNick(n), setMe(m))} />;
  if (me.mustChangePassword || changing)
    return (
      <ChangePasswordPage
        auth={auth}
        nick={nick}
        forced={me.mustChangePassword}
        onDone={() => {
          setChanging(false);
          setMe({ ...me, mustChangePassword: false });
        }}
        onCancel={() => setChanging(false)}
      />
    );
  return (
    <SignedIn
      repo={repo}
      auth={auth}
      viewer={{ playerId: me.playerId, isAdmin: me.isAdmin }}
      onChangePassword={() => setChanging(true)}
      onSignOut={async () => {
        await auth.signOut();
        setNick(null);
        setMe(null);
      }}
    />
  );
}

function SignedIn({
  repo,
  auth,
  viewer,
  onChangePassword,
  onSignOut,
}: {
  repo: Repository;
  auth: AuthService;
  viewer: Viewer;
  onChangePassword(): void;
  onSignOut(): void;
}) {
  const store = useAppState(repo);
  const [route, navigate] = useHashRoute();
  const [prefs, setPrefsState] = useState<UiPrefs>(loadPrefs);
  const setPrefs = (p: UiPrefs) => {
    setPrefsState(p);
    savePrefs(p);
  };
  const myName = store.data.players.find((p) => p.id === viewer.playerId)?.name ?? null;
  // Běžící trénink, na kterém jsem → Živě a Moje hra v navigaci.
  const now = useNow();
  const active = useMemo(() => activeFor(store.data.trainings, viewer.playerId, Math.max(now.getTime(), Date.now())), [store.data.trainings, viewer.playerId, now]);
  // Otevření appky (bez adresy): rozehraná hra → Moje hra, běžící trénink → Živě, jinak Trénink.
  const [openedBare] = useState(() => /^#?\/?$/.test(window.location.hash));
  const redirected = useRef(false);
  useEffect(() => {
    if (!openedBare || redirected.current || store.status !== 'ready') return;
    redirected.current = true;
    if (active) navigate({ page: active.myGame ? 'my' : 'live' });
  }, [openedBare, store.status, active, navigate]);
  const noLive = (
    <div className="empty-live">
      <p>
        <strong>Teď neběží žádný trénink, na kterém hraješ.</strong>
      </p>
      <p className="note">Až organizátor trénink zahájí, uvidíš tu stoly a svou hru.</p>
      <button type="button" onClick={() => navigate({ page: 'trainings' })}>
        Tréninky
      </button>
    </div>
  );

  let body: React.ReactNode;
  if (store.status === 'loading') body = <p className="note">Načítám…</p>;
  else if (store.status === 'error')
    body = (
      <div className="load-error">
        <p>Nepodařilo se načíst data.</p>
        <button type="button" onClick={store.reload}>
          Zkusit znovu
        </button>
      </div>
    );
  else if (route.page === 'players') body = <PlayersPage store={store} viewer={viewer} auth={auth} />;
  else if (route.page === 'trainings') body = <TrainingsPage store={store} navigate={navigate} viewer={viewer} />;
  else if (route.page === 'training')
    body = <TrainingPage key={route.id} store={store} id={route.id} navigate={navigate} viewer={viewer} />;
  else if (route.page === 'training-new') body = <NewTrainingPage store={store} navigate={navigate} viewer={viewer} />;
  else if (route.page === 'training-edit')
    body = <EditTrainingPage key={route.id} store={store} id={route.id} navigate={navigate} viewer={viewer} />;
  else if (route.page === 'live' || route.page === 'my')
    body = active ? (
      <TrainingPage key={`${route.page}-${active.training.id}`} store={store} id={active.training.id} navigate={navigate} viewer={viewer} view={route.page} />
    ) : (
      noLive
    );
  else if (route.page === 'ladder') body = <LadderPage store={store} prefs={prefs} setPrefs={setPrefs} navigate={navigate} />;
  else body = <PlayerPage store={store} id={route.id} prefs={prefs} navigate={navigate} />;

  return (
    <>
      <MainNav
        route={route}
        navigate={navigate}
        myName={myName}
        onChangePassword={onChangePassword}
        onSignOut={onSignOut}
        live={!!active}
        myTurn={!!active?.myTurn}
        admin={viewer.isAdmin}
      />
      {store.saveState === 'retrying' && (
        <div className="save-banner" role="status">
          Neuloženo – zkouším znovu
        </div>
      )}
      {store.saveError && (
        <div className="save-banner" role="alert">
          {store.saveError}{' '}
          <button type="button" className="ghost banner-ok" onClick={store.dismissSaveError}>
            OK
          </button>
        </div>
      )}
      <main className="page">{body}</main>
    </>
  );
}
