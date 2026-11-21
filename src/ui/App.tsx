import { activeFor, myFinishedToday, runningTraining } from './active';
import { useNow } from './now';
import { EditTrainingPage, NewTrainingPage } from './pages/TrainingWizardPages';
import { useEffect, useMemo, useRef, useState } from 'react';
import { viewerOf, type Viewer } from '../domain/my';
import { memoryAuth, type AuthService, type Me } from '../storage/auth';
import { loadPrefs, savePrefs, type UiPrefs } from '../storage/prefs';
import type { Repository } from '../storage/repository';
import type { Outbox } from '../storage/outbox';
import type { SnapshotStore } from '../storage/snapshot';
import type { AppVersion } from '../storage/appVersion';
import { useAppVersion } from './useAppVersion';
import { reloadApp } from './reload';
import { AuthHeader, MainNav } from './components/MainNav';
import { LadderPage } from './pages/LadderPage';
import { DisciplinesPage } from './pages/DisciplinesPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { applyCatalog } from '../domain/catalog';
import { ChangePasswordPage, LoginPage } from './pages/LoginPage';
import { GuidePage } from './pages/GuidePage';
import { PlayerPage } from './pages/PlayerPage';
import { PlayersPage } from './pages/PlayersPage';
import { PracticePage } from './pages/PracticePage';
import { isPractice } from '../domain/practice';
import { TrainingPage } from './pages/TrainingPage';
import { TrainingsPage } from './pages/TrainingsPage';
import { useAppState } from './useAppState';
import { useHashRoute } from './useHashRoute';
import { useWakeLock } from './wakeLock';
import { vibrate } from './vibrate';
import { TrainingsProvider } from './records';
import { PlayersProvider } from './components/Avatar';
import { TrainingRecap } from './components/TrainingRecap';
import { PATCH_NOTES, PatchNotesPage } from './components/PatchNotes';
import { compareVersions, notesSince } from './patchNotes';
import { APP_VERSION } from '../storage/appVersion';
import type { SeenVersionStore } from '../storage/prefs';

const defaultAuth = memoryAuth();

/** PRD 4.7: bez přihlášení jen přihlašovací obrazovka, po prvním přihlášení vynucená změna hesla. */
export function App({
  repo,
  auth = defaultAuth,
  outboxFor,
  latestVersion,
  snapshotFor,
  seenVersion,
}: {
  repo: Repository;
  auth?: AuthService;
  /** Naposledy viděná verze patch notes v zařízení; bez ní se po aktualizaci nic neukazuje (testy). */
  seenVersion?: SeenVersionStore;
  /** Fronta neodeslaných zápisů v zařízení pro přihlášeného hráče; bez ní fronta zavření appky nepřežije. */
  outboxFor?: (playerId: string) => Outbox;
  /** Zjistí právě nasazenou verzi appky; bez ní se verze nekontroluje (testy, vývoj). */
  latestVersion?: () => Promise<AppVersion | null>;
  /** Poslední stav appky uložený v zařízení pro přihlášeného hráče (rychlý start, pomalé spojení). */
  snapshotFor?: (playerId: string) => SnapshotStore;
}) {
  // Zapamatované přihlášení platí hned; server ho ověří na pozadí.
  const [me, setMe] = useState<Me | null | 'loading'>(() => auth.cached?.() ?? 'loading');
  const [nick, setNick] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  // Návod pro hráče je vidět i bez přihlášení (10. 11. 2026).
  const [route] = useHashRoute();

  useEffect(() => {
    let alive = true;
    auth.current().then(
      (m) => alive && setMe(m),
      // Nepodařilo se ověřit (bez spojení): zapamatované přihlášení platí dál, jinak přihlašovací obrazovka.
      () => alive && setMe((cur) => (cur === 'loading' ? null : cur)),
    );
    return () => {
      alive = false;
    };
  }, [auth]);

  if (route.page === 'guide')
    return (
      <GuidePage
        signedIn={me !== 'loading' && !!me}
        onBack={() => {
          window.location.hash = '#/trainings';
        }}
      />
    );
  if (me === 'loading') return <main className="page"><p className="note">Načítám…</p></main>;
  // Co je nového jde číst i bez přihlášení (odkaz z čísla verze na přihlášení a v Návodu).
  if (!me && route.page === 'patch-notes')
    return (
      <main className="page pn-public">
        <AuthHeader />
        <PatchNotesPage />
        <button type="button" onClick={() => (window.location.hash = '#/trainings')}>
          Přihlásit se
        </button>
      </main>
    );
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
      outboxFor={outboxFor}
      latestVersion={latestVersion}
      snapshotFor={snapshotFor}
      seenVersion={seenVersion}
      viewer={{ playerId: me.playerId, isAdmin: me.isAdmin }}
      onChangePassword={() => setChanging(true)}
      onSignOut={async () => {
        // Data klubu po odhlášení v zařízení nezůstávají.
        await snapshotFor?.(me.playerId).clear();
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
  outboxFor,
  latestVersion,
  snapshotFor,
  seenVersion,
  viewer: me,
  onChangePassword,
  onSignOut,
}: {
  repo: Repository;
  auth: AuthService;
  outboxFor?: (playerId: string) => Outbox;
  latestVersion?: () => Promise<AppVersion | null>;
  snapshotFor?: (playerId: string) => SnapshotStore;
  seenVersion?: SeenVersionStore;
  viewer: Viewer;
  onChangePassword(): void;
  onSignOut(): void;
}) {
  const outbox = useMemo(() => (me.playerId ? outboxFor?.(me.playerId) : undefined), [outboxFor, me.playerId]);
  const snapshot = useMemo(() => (me.playerId ? snapshotFor?.(me.playerId) : undefined), [snapshotFor, me.playerId]);
  const store = useAppState(repo, { outbox, snapshot });
  const version = useAppVersion(latestVersion);
  // Po aktualizaci jednou: lišta „Nová verze“ s odkazem na Co je nového (20. 11. 2026). Verze, které zařízení
  // ještě nevidělo, zůstanou na stránce označené „Nové pro tebe“ do zavření appky.
  const [news, setNews] = useState(() => {
    const seen = seenVersion?.load() ?? null;
    const fresh = seenVersion ? notesSince(PATCH_NOTES, seen, APP_VERSION).map((e) => e.version) : [];
    return { seen, fresh, banner: fresh.length > 0 };
  });
  const ackNews = () => {
    seenVersion?.save(APP_VERSION);
    setNews((n) => (n.banner ? { ...n, banner: false } : n));
  };
  useEffect(() => {
    // Nic k ukázání (vývojová verze bez záznamu): verze se jen zapamatuje.
    if (seenVersion && !news.fresh.length && (news.seen === null || compareVersions(APP_VERSION, news.seen) > 0)) seenVersion.save(APP_VERSION);
  }, [seenVersion, news]);
  // Organizátor podle soupisky – když ho admin nastaví / odebere, platí to hned (10. 11. 2026).
  const viewer = viewerOf(me.playerId, me.isAdmin, store.data.players);
  // Katalog disciplín (názvy, štítky, nápovědy, délky pro nové tréninky) platí pro celou appku.
  const appliedCatalog = useRef<unknown>(null);
  if (appliedCatalog.current !== (store.data.catalog ?? null)) {
    applyCatalog(store.data.catalog);
    appliedCatalog.current = store.data.catalog ?? null;
  }
  const [route, navigate] = useHashRoute();
  // Otevřená stránka Co je nového = poznámky viděné (lišta zmizí, označení „Nové pro tebe“ zůstane).
  useEffect(() => {
    if (route.page === 'patch-notes' && news.banner) ackNews();
  });
  const [prefs, setPrefsState] = useState<UiPrefs>(loadPrefs);
  const setPrefs = (p: UiPrefs) => {
    setPrefsState(p);
    savePrefs(p);
  };
  const myName = store.data.players.find((p) => p.id === viewer.playerId)?.name ?? null;
  // Běžící trénink, na kterém hraju → Moje hry v navigaci; probíhající trénink kohokoli → „Trénink“ ho otevře.
  const now = useNow();
  const active = useMemo(() => activeFor(store.data.trainings, viewer.playerId, Math.max(now.getTime(), Date.now())), [store.data.trainings, viewer.playerId, now]);
  const finished = useMemo(() => (active ? null : myFinishedToday(store.data.trainings, viewer.playerId, Math.max(now.getTime(), Date.now()))), [active, store.data.trainings, viewer.playerId, now]);
  const running = useMemo(() => runningTraining(store.data.trainings, Math.max(now.getTime(), Date.now())), [store.data.trainings, now]);
  // Jsem na řadě a ještě nejsem připravený (20. 11. 2026): telefon jednou zavibruje a drží displej rozsvícený,
  // ať hráč nezdržuje. Jen s otevřenou appkou (bez notifikací); iPhone vibrace z webu neumí.
  const myTurn = !!active?.myTurn;
  useWakeLock(myTurn);
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) vibrate([200, 100, 200]);
    wasMyTurn.current = myTurn;
  }, [myTurn]);
  // Otevření appky (bez adresy): rozehraná hra → Moje hry, probíhající trénink → jeho rozpis, jinak Trénink (Živě zrušeno 19. 11. 2026).
  const [openedBare] = useState(() => /^#?\/?$/.test(window.location.hash));
  const redirected = useRef(false);
  useEffect(() => {
    if (!openedBare || redirected.current || store.status !== 'ready') return;
    redirected.current = true;
    if (active?.myGame) navigate({ page: 'my' });
    else if (running) navigate({ page: 'training', id: running.id });
  }, [openedBare, store.status, active, running, navigate]);
  const noLive = (
    <div className="empty-live">
      <p>
        <strong>Teď neběží žádný trénink, na kterém hraješ nebo který organizuješ.</strong>
      </p>
      <p className="note">Až organizátor trénink zahájí, uvidíš tu stoly a svou hru.</p>
      <button type="button" onClick={() => navigate({ page: 'trainings' })}>
        Tréninky
      </button>
    </div>
  );

  const reload = () => void reloadApp();
  let body: React.ReactNode;
  if (version === 'required')
    // Starší verze by počítala jiný rozpis nebo nerozuměla databázi – dál se s ní nepracuje.
    body = (
      <div className="load-error" role="alert">
        <p>
          <strong>Appka má novou verzi a bez obnovení nejde pokračovat.</strong>
        </p>
        <p className="note">Změny, které ještě neodešly, zůstanou v zařízení a odešlou se po obnovení.</p>
        <button type="button" onClick={reload}>
          Obnovit
        </button>
      </div>
    );
  else if (store.status === 'loading') body = <p className="note">Načítám…</p>;
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
  else if (route.page === 'trainings') body = <TrainingsPage store={store} navigate={navigate} viewer={viewer} prefs={prefs} setPrefs={setPrefs} />;
  else if (route.page === 'practice-new' || route.page === 'practice' || (route.page === 'training' && store.data.trainings.some((t) => t.id === route.id && isPractice(t))))
    // Stejný klíč: po založení (practice-new → practice) zůstane vybrané cvičení na obrazovce.
    body = <PracticePage key="practice" store={store} id={route.page === 'practice-new' ? null : route.id} navigate={navigate} viewer={viewer} />;
  else if (route.page === 'training')
    body = <TrainingPage key={route.id} store={store} id={route.id} navigate={navigate} viewer={viewer} />;
  else if (route.page === 'training-new') body = <NewTrainingPage store={store} navigate={navigate} viewer={viewer} />;
  else if (route.page === 'training-edit')
    body = <EditTrainingPage key={route.id} store={store} id={route.id} navigate={navigate} viewer={viewer} />;
  else if (route.page === 'live')
    // Stará adresa záložky Živě: probíhající trénink, jinak seznam tréninků.
    body = running ? (
      <TrainingPage key={running.id} store={store} id={running.id} navigate={navigate} viewer={viewer} />
    ) : (
      <TrainingsPage store={store} navigate={navigate} viewer={viewer} prefs={prefs} setPrefs={setPrefs} />
    );
  else if (route.page === 'my')
    body = active ? (
      <TrainingPage key={`${route.page}-${active.training.id}`} store={store} id={active.training.id} navigate={navigate} viewer={viewer} view={route.page} />
    ) : finished && viewer.playerId ? (
      // Po tréninku místo prázdné hlášky „Tvůj trénink“ (20. 11. 2026).
      <TrainingRecap training={finished} playerId={viewer.playerId} trainings={store.data.trainings} />
    ) : (
      noLive
    );
  else if (route.page === 'disciplines') body = <DisciplinesPage store={store} admin={viewer.isAdmin} />;
  else if (route.page === 'patch-notes') body = <PatchNotesPage fresh={news.fresh} />;
  else if (route.page === 'templates') body = <TemplatesPage store={store} admin={viewer.isAdmin} />;
  else if (route.page === 'ladder') body = <LadderPage store={store} prefs={prefs} setPrefs={setPrefs} navigate={navigate} me={viewer.playerId} />;
  else if (route.page === 'player') body = <PlayerPage store={store} id={route.id} focus={route.focus} prefs={prefs} navigate={navigate} me={viewer.playerId} admin={viewer.isAdmin} />;
  else if (route.page === 'not-found')
    body = (
      <div className="empty-live not-found">
        <h1>Stránka nenalezena</h1>
        <p className="note">Tahle adresa v appce neexistuje. Odkaz je možná starý nebo neúplný.</p>
        <button type="button" onClick={() => navigate({ page: 'trainings' })}>
          Na úvodní stránku
        </button>
      </div>
    );

  return (
    <PlayersProvider players={store.data.players} me={viewer.playerId}>
      <MainNav
        route={route}
        navigate={navigate}
        myName={myName}
        myId={viewer.playerId}
        onChangePassword={onChangePassword}
        onSignOut={onSignOut}
        live={!!active}
        running={running?.id ?? null}
        mine={!!active?.plays}
        myTurn={!!active?.myTurn}
        admin={viewer.isAdmin}
      />
      {news.banner && route.page !== 'patch-notes' && (
        <div className="update-banner news-banner" role="status">
          Appka má novou verzi {APP_VERSION}.{' '}
          <button type="button" className="ghost banner-ok" onClick={() => navigate({ page: 'patch-notes' })}>
            Co je nového
          </button>
          <button type="button" className="link" onClick={ackNews}>
            Skrýt
          </button>
        </div>
      )}
      {version === 'update' && (
        <div className="update-banner" role="status">
          Je k dispozici nová verze appky.{' '}
          <button type="button" className="ghost banner-ok" onClick={reload}>
            Obnovit
          </button>
        </div>
      )}
      {store.offline && store.status === 'ready' && store.saveState !== 'retrying' && (
        <div className="offline-banner" role="status">
          Bez spojení – vidíš poslední uložený stav. Změny se odešlou, až se spojení vrátí.
        </div>
      )}
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
      <main className="page">
        <TrainingsProvider trainings={store.data.trainings}>{body}</TrainingsProvider>
      </main>
    </PlayersProvider>
  );
}
