import { useState } from 'react';
import {
  activePlayers,
  addPlayer,
  canDeletePlayer,
  movePlayer,
  renamePlayer,
  setArchived,
  sortedRoster,
  type RosterError,
} from '../../domain/roster';
import type { Player } from '../../domain/types';
import { exportJson } from '../../storage/backup';
import { todayIso } from '../dates';
import type { Viewer } from '../../domain/my';
import type { AuthService } from '../../storage/auth';
import type { AppStore } from '../useAppState';

export const ROSTER_ERRORS: Record<RosterError, string> = {
  empty: 'Zadej jméno',
  duplicate: 'Hráč s tímto jménem už je na soupisce',
};

/** Uloží jen hráče, kteří se změnili. */
export function persistPlayers(store: AppStore, next: Player[]) {
  const prev = new Map(store.data.players.map((p) => [p.id, p]));
  for (const p of next) {
    const old = prev.get(p.id);
    if (!old || old.name !== p.name || old.order !== p.order || old.archived !== p.archived) store.savePlayer(p);
  }
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PlayerRow({
  store,
  player,
  first,
  last,
  onReset,
}: {
  store: AppStore;
  player: Player;
  first: boolean;
  last: boolean;
  onReset(p: Player): void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);
  const [error, setError] = useState<string | null>(null);
  const players = store.data.players;

  const save = () => {
    const r = renamePlayer(players, player.id, name);
    if ('error' in r) return setError(ROSTER_ERRORS[r.error]);
    persistPlayers(store, r.players);
    setEditing(false);
    setError(null);
  };

  return (
    <li data-name={player.name} className="player-row">
      {editing ? (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input aria-label={`Nové jméno pro ${player.name}`} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <button type="submit">Uložit</button>
          <button type="button" className="ghost" onClick={() => (setEditing(false), setName(player.name), setError(null))}>
            Zrušit
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      ) : (
        <>
          <span className="player-name">{player.name}</span>
          <span className="row-actions">
            <button type="button" className="icon" aria-label={`Posunout ${player.name} nahoru`} disabled={first} onClick={() => persistPlayers(store, movePlayer(players, player.id, -1))}>
              ↑
            </button>
            <button type="button" className="icon" aria-label={`Posunout ${player.name} dolů`} disabled={last} onClick={() => persistPlayers(store, movePlayer(players, player.id, 1))}>
              ↓
            </button>
            <button type="button" className="ghost" aria-label={`Přejmenovat ${player.name}`} onClick={() => setEditing(true)}>
              Přejmenovat
            </button>
            <button type="button" className="ghost" aria-label={`Resetovat heslo ${player.name}`} onClick={() => onReset(player)}>
              Reset hesla
            </button>
            <button type="button" className="ghost" aria-label={`Archivovat ${player.name}`} onClick={() => persistPlayers(store, setArchived(players, player.id, true))}>
              Archivovat
            </button>
          </span>
        </>
      )}
    </li>
  );
}

export function PlayersPage({ store, viewer, auth }: { store: AppStore; viewer?: Viewer; auth?: AuthService }) {
  const isAdmin = viewer?.isAdmin ?? true;
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const players = store.data.players;
  const active = activePlayers(players);
  const archived = sortedRoster(players).filter((p) => p.archived);

  const add = () => {
    const r = addPlayer(players, store.newId(), name);
    if ('error' in r) return setError(ROSTER_ERRORS[r.error]);
    persistPlayers(store, r.players);
    setName('');
    setError(null);
  };

  const reset = async (p: Player) => {
    if (!auth || !confirm(`Vrátit heslo hráče ${p.name} na jeho přezdívku?`)) return;
    try {
      const ok = await auth.resetPassword(p.id);
      setNotice(ok ? `Heslo hráče ${p.name} je zase jeho přezdívka.` : `${p.name} se ještě nepřihlásil, heslo je pořád jeho přezdívka.`);
    } catch {
      setNotice('Heslo se nepodařilo resetovat.');
    }
  };

  if (!isAdmin)
    return (
      <section>
        <h1>Hráči</h1>
        <p className="lead">Soupiska klubu. Spravuje ji admin.</p>
        <ul className="player-list" aria-label="Aktivní hráči">
          {active.map((p) => (
            <li key={p.id} data-name={p.name} className="player-row">
              <span className="player-name">{p.name}</span>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <section>
      <h1>Hráči</h1>
      <p className="lead">Soupiska klubu. Pořadí na soupisce je výchozí nominační pořadí pro trénink.</p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor="new-player">Jméno nového hráče</label>
        <div className="add-row">
          <input id="new-player" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <button type="submit">Přidat</button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>

      {active.length === 0 ? (
        <p className="note">Soupiska je prázdná. Přidej první hráče.</p>
      ) : (
        <ul className="player-list" aria-label="Aktivní hráči">
          {active.map((p, i) => (
            <PlayerRow key={p.id} store={store} player={p} first={i === 0} last={i === active.length - 1} onReset={reset} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <details className="archived">
          <summary>Archivovaní ({archived.length})</summary>
          <ul className="player-list" aria-label="Archivovaní hráči">
            {archived.map((p) => (
              <li key={p.id} data-name={p.name} className="player-row">
                <span className="player-name muted">{p.name}</span>
                <span className="row-actions">
                  <button type="button" className="ghost" aria-label={`Obnovit ${p.name}`} onClick={() => persistPlayers(store, setArchived(players, p.id, false))}>
                    Obnovit
                  </button>
                  {canDeletePlayer(store.data.trainings, p.id) && (
                    <button
                      type="button"
                      className="ghost danger"
                      aria-label={`Smazat ${p.name}`}
                      onClick={() => confirm(`Smazat hráče ${p.name}? Nebyl na žádném tréninku.`) && store.deletePlayer(p.id)}
                    >
                      Smazat
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <h2>Záloha dat</h2>
      <p className="note">Stáhne soupisku, tréninky i skóre jako soubor JSON.</p>
      <button
        type="button"
        onClick={() => {
          const { filename, json } = exportJson(store.data, todayIso());
          download(filename, json);
        }}
      >
        Stáhnout zálohu
      </button>
    </section>
  );
}
