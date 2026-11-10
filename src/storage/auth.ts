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
  /**
   * Přihlášení zapamatované v zařízení – hned, bez sítě. Appka podle něj naběhne dřív, než server
   * přihlášení ověří (`current`), a zůstane přihlášená, i když ověření kvůli spojení selže.
   */
  cached?(): Me | null;
  /**
   * Ověří přihlášení na serveru (např. po znovuotevření appky). null = přihlášení neplatí;
   * chyba = nepodařilo se zjistit (bez spojení) – zapamatované přihlášení platí dál.
   */
  current(): Promise<Me | null>;
  /** Přihlášení přezdívkou; při prvním přihlášení je heslo přezdívka. */
  signIn(nick: string, password: string): Promise<Me>;
  signOut(): Promise<void>;
  changePassword(newPassword: string): Promise<void>;
  /** Admin: heslo hráče zpět na přezdívku. Vrací false, když hráč ještě nemá účet. */
  resetPassword(playerId: PlayerId): Promise<boolean>;
}

export class AuthError extends Error {}

const ME_KEY = 'foosball-practice.me.v1';

/** Přihlášený hráč zapamatovaný v zařízení (jen pro rychlý start – práva hlídá databáze). */
export function cachedMe(): Me | null {
  try {
    const m = JSON.parse(localStorage.getItem(ME_KEY) ?? 'null') as Partial<Me> | null;
    return m && typeof m.playerId === 'string' ? { playerId: m.playerId, isAdmin: !!m.isAdmin, mustChangePassword: !!m.mustChangePassword } : null;
  } catch {
    return null;
  }
}

/** Zapamatuje přihlášeného hráče; null zapomene. */
export function rememberMe(m: Me | null): void {
  try {
    if (m) localStorage.setItem(ME_KEY, JSON.stringify(m));
    else localStorage.removeItem(ME_KEY);
  } catch {
    /* bez uložení to běží dál */
  }
}

export function supabaseAuth(client: SupabaseClient): AuthService {
  const me = async (): Promise<Me | null> => {
    const { data, error, status } = await client.rpc('my_account');
    if (error) throw fromPostgrest(error, status);
    const row = (data as { player_id: string; is_admin: boolean; must_change_password: boolean }[] | null)?.[0];
    const m = row ? { playerId: row.player_id, isAdmin: row.is_admin, mustChangePassword: row.must_change_password } : null;
    rememberMe(m);
    return m;
  };
  return {
    cached: cachedMe,
    async current() {
      const { data, error } = await client.auth.getSession();
      // Přihlášení vypršelo a bez spojení ho nejde obnovit: to není odhlášení.
      if (!data.session && (error as { name?: string } | null)?.name === 'AuthRetryableFetchError') throw error;
      if (!data.session) {
        rememberMe(null);
        return null;
      }
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
      rememberMe(null);
      await client.auth.signOut();
    },
    async changePassword(pw) {
      const { error } = await client.auth.updateUser({ password: pw + PASSWORD_SUFFIX });
      if (error) throw new AuthError('Heslo se nepodařilo změnit.');
      const r = await client.rpc('password_changed');
      if (r.error) throw fromPostgrest(r.error, r.status);
      const m = cachedMe();
      if (m) rememberMe({ ...m, mustChangePassword: false });
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
