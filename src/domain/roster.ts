import type { Player, PlayerId, Training } from './types';

export type RosterError = 'empty' | 'duplicate';
type RosterResult = { players: Player[] } | { error: RosterError };

export const normalizeName = (name: string): string => name.trim().replace(/\s+/g, ' ');
const key = (name: string) => normalizeName(name).toLocaleLowerCase('cs');

export function sortedRoster(players: Player[]): Player[] {
  return [...players].sort((a, b) => a.order - b.order);
}

const czech = new Intl.Collator('cs', { sensitivity: 'base' });

/** Pro zobrazení (Hráči, Přítomní): podle české abecedy. Pořadí v soupisce (order) se nemění. */
export function alphabetical(players: Player[]): Player[] {
  return [...players].sort((a, b) => czech.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function activePlayers(players: Player[]): Player[] {
  return sortedRoster(players).filter((p) => !p.archived);
}

function validate(players: Player[], name: string, selfId?: PlayerId): RosterError | null {
  if (!normalizeName(name)) return 'empty';
  if (players.some((p) => p.id !== selfId && key(p.name) === key(name))) return 'duplicate';
  return null;
}

export function addPlayer(players: Player[], id: PlayerId, name: string): RosterResult {
  const error = validate(players, name);
  if (error) return { error };
  const order = players.reduce((m, p) => Math.max(m, p.order), -1) + 1;
  return { players: [...players, { id, name: normalizeName(name), archived: false, order }] };
}

export function renamePlayer(players: Player[], id: PlayerId, name: string): RosterResult {
  const error = validate(players, name, id);
  if (error) return { error };
  return { players: players.map((p) => (p.id === id ? { ...p, name: normalizeName(name) } : p)) };
}

/** Prohodí `order` se sousedem mezi aktivními hráči. */
export function movePlayer(players: Player[], id: PlayerId, dir: -1 | 1): Player[] {
  const active = activePlayers(players);
  const i = active.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= active.length) return players;
  const a = active[i];
  const b = active[j];
  return players.map((p) => (p.id === a.id ? { ...p, order: b.order } : p.id === b.id ? { ...p, order: a.order } : p));
}

export function setArchived(players: Player[], id: PlayerId, archived: boolean): Player[] {
  return players.map((p) => (p.id === id ? { ...p, archived } : p));
}

export function canDeletePlayer(trainings: Training[], id: PlayerId): boolean {
  return !trainings.some((t) => t.attendees.includes(id));
}

export function deletePlayer(players: Player[], id: PlayerId): Player[] {
  return players.filter((p) => p.id !== id);
}
