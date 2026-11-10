import { useState, type KeyboardEvent } from 'react';
import { AuthError, MIN_PASSWORD, type AuthService, type Me } from '../../storage/auth';

/** Enter v prvním poli skočí na další pole místo odeslání (klávesnice mobilu ukáže „Další“). */
function enterToNext(nextId: string) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    document.getElementById(nextId)?.focus();
  };
}

export function LoginPage({ auth, onDone }: { auth: AuthService; onDone(me: Me, nick: string): void }) {
  const [nick, setNick] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="page auth-page">
      <h1>Přihlášení</h1>
      <p className="lead">Poprvé je heslo tvoje přezdívka, přesně jak je na soupisce. Pak si nastavíš vlastní.</p>
      <form
        className="auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            onDone(await auth.signIn(nick, pw), nick.trim());
          } catch (err) {
            setError(err instanceof AuthError ? err.message : 'Přihlášení se nepovedlo, zkus to znovu.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="login-nick">Přezdívka</label>
        <input id="login-nick" value={nick} onChange={(e) => setNick(e.target.value)} autoComplete="username" autoFocus enterKeyHint="next" onKeyDown={enterToNext('login-pw')} />
        <label htmlFor="login-pw">Heslo</label>
        <input id="login-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" enterKeyHint="go" />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || !nick.trim() || !pw}>
          Přihlásit
        </button>
      </form>
      <p className="auth-guide">
        <a href="#/guide">Jak appka funguje ›</a>
      </p>
    </main>
  );
}

export function ChangePasswordPage({
  auth,
  nick,
  forced,
  onDone,
  onCancel,
}: {
  auth: AuthService;
  nick: string | null;
  forced: boolean;
  onDone(): void;
  onCancel?(): void;
}) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="page auth-page">
      <h1>Nastav si heslo</h1>
      {forced && <p className="lead">Dokud máš heslo stejné jako přezdívku, může se za tebe přihlásit kdokoli. Zvol si vlastní.</p>}
      <form
        className="auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (a.length < MIN_PASSWORD) return setError(`Heslo musí mít aspoň ${MIN_PASSWORD} znaky.`);
          if (a !== b) return setError('Hesla se neshodují.');
          if (nick && a === nick) return setError('Heslo nesmí být stejné jako přezdívka.');
          setBusy(true);
          setError(null);
          try {
            await auth.changePassword(a);
            onDone();
          } catch {
            setError('Heslo se nepodařilo změnit, zkus to znovu.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="pw-new">Nové heslo</label>
        <input id="pw-new" type="password" value={a} onChange={(e) => setA(e.target.value)} autoComplete="new-password" autoFocus enterKeyHint="next" onKeyDown={enterToNext('pw-again')} />
        <label htmlFor="pw-again">Nové heslo znovu</label>
        <input id="pw-again" type="password" value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" enterKeyHint="done" />
        {error && <p className="error">{error}</p>}
        <div className="actions-row">
          <button type="submit" disabled={busy}>
            Uložit heslo
          </button>
          {!forced && onCancel && (
            <button type="button" className="ghost" onClick={onCancel}>
              Zpět
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
