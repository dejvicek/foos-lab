import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlayerId } from '../domain/types';
import { fromPostgrest, StorageError } from './errors';

/** Přípona hesla – stejná jako `pw_suffix()` v databázi (migrace 6). */
export const PASSWORD_SUFFIX = '#rozpis-stolu';
export const MIN_PASSWORD = 4;

export interface Me {
  playerId: PlayerId;
  isAdmin: boolean;
  mustChangePassword: boolean;
}

export interface AuthService {
  /** Obnoví přihlášení (např. po znovuotevření appky). */
  current(): Promise<Me | null>;
  /** Přihlášení přezdívkou; při prvním přihlášení je heslo přezdívka. */
  signIn(nick: string, password: string): Promise<Me>;
  signOut(): Promise<void>;
  changePassword(newPassword: string): Promise<void>;
  /** Admin: heslo hráče zpět na přezdívku. Vrací false, když hráč ještě nemá účet. */
  resetPassword(playerId: PlayerId): Promise<boolean>;
}

export class AuthError extends Error {}

export function supabaseAuth(client: SupabaseClient): AuthService {
  const me = async (): Promise<Me | null> => {
    const { data, error, status } = await client.rpc('my_account');
    if (error) throw fromPostgrest(error, status);
    const row = (data as { player_id: string; is_admin: boolean; must_change_password: boolean }[] | null)?.[0];
    return row ? { playerId: row.player_id, isAdmin: row.is_admin, mustChangePassword: row.must_change_password } : null;
  };
  return {
    async current() {
      const { data } = await client.auth.getSession();
      if (!data.session) return null;
      return me();
    },
    async signIn(nick, password) {
      const prep = await client.rpc('login_prepare', { p_nick: nick });
      if (prep.error) throw fromPostgrest(prep.error, prep.status);
      if (!prep.data) throw new AuthError('Hráč s touto přezdívkou na soupisce není.');
      const { error } = await client.auth.signInWithPassword({ email: prep.data as string, password: password + PASSWORD_SUFFIX });
      if (error) throw new AuthError(error.status === 400 ? 'Špatné heslo.' : 'Přihlášení se nepovedlo, zkus to znovu.');
      const m = await me();
      if (!m) throw new AuthError('Účet není propojený s hráčem.');
      return m;
    },
    async signOut() {
      await client.auth.signOut();
    },
    async changePassword(pw) {
      const { error } = await client.auth.updateUser({ password: pw + PASSWORD_SUFFIX });
      if (error) throw new AuthError('Heslo se nepodařilo změnit.');
      const r = await client.rpc('password_changed');
      if (r.error) throw fromPostgrest(r.error, r.status);
    },
    async resetPassword(playerId) {
      const { data, error, status } = await client.rpc('admin_reset_password', { p_player: playerId });
      if (error) throw fromPostgrest(error, status);
      return !!data;
    },
  };
}

/** Přihlášení v paměti – testy a vývoj bez sítě. Hesla = přezdívky, dokud se nezmění. */
export function memoryAuth(opts: { players?: { id: PlayerId; name: string; isAdmin?: boolean }[]; signedIn?: Me | null } = {}): AuthService & {
  passwords: Map<PlayerId, string>;
  mustChange: Set<PlayerId>;
} {
  const players = opts.players ?? [];
  const passwords = new Map<PlayerId, string>();
  const mustChange = new Set<PlayerId>();
  let session: Me | null = opts.signedIn === undefined ? { playerId: 'admin', isAdmin: true, mustChangePassword: false } : opts.signedIn;
  const meOf = (id: PlayerId): Me => ({
    playerId: id,
    isAdmin: !!players.find((p) => p.id === id)?.isAdmin,
    mustChangePassword: mustChange.has(id),
  });
  return {
    passwords,
    mustChange,
    async current() {
      return session ? (session.playerId === 'admin' ? session : meOf(session.playerId)) : null;
    },
    async signIn(nick, password) {
      const p = players.find((x) => x.name.toLocaleLowerCase('cs') === nick.trim().toLocaleLowerCase('cs'));
      if (!p) throw new AuthError('Hráč s touto přezdívkou na soupisce není.');
      if (!passwords.has(p.id)) {
        passwords.set(p.id, p.name);
        mustChange.add(p.id);
      }
      if (passwords.get(p.id) !== password) throw new AuthError('Špatné heslo.');
      session = meOf(p.id);
      return session;
    },
    async signOut() {
      session = null;
    },
    async changePassword(pw) {
      if (!session) throw new AuthError('Nejsi přihlášený.');
      passwords.set(session.playerId, pw);
      mustChange.delete(session.playerId);
      session = meOf(session.playerId);
    },
    async resetPassword(playerId) {
      if (!session?.isAdmin) throw new StorageError('Jen admin', true, 'chybí oprávnění');
      const p = players.find((x) => x.id === playerId);
      if (!p || !passwords.has(playerId)) return false;
      passwords.set(playerId, p.name);
      mustChange.add(playerId);
      return true;
    },
  };
}
