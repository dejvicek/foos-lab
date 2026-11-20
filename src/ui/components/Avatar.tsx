import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Player, PlayerId } from '../../domain/types';

/**
 * Profilové fotky (21. 11. 2026). Kroužek čte hráče z kontextu, takže tabulky a zrcadla dostávají jen ID
 * jako dosud. Bez provideru (testy jednotlivých komponent) se nic nekreslí.
 */
interface Ctx {
  byId: Map<PlayerId, Player>;
  me: PlayerId | null;
}
const PlayersContext = createContext<Ctx | null>(null);

export function PlayersProvider({ players, me, children }: { players: Player[]; me: PlayerId | null; children: ReactNode }) {
  const value = useMemo(() => ({ byId: new Map(players.map((p) => [p.id, p])), me }), [players, me]);
  return <PlayersContext.Provider value={value}>{children}</PlayersContext.Provider>;
}

/** s = řádek tabulky (24 px), m = tlačítko účtu (30 px), l = zrcadlo stolu (40 px), xl = profil (84 px). */
export type AvatarSize = 's' | 'm' | 'l' | 'xl';

export const initialOf = (name: string | undefined): string => name?.trim().charAt(0).toUpperCase() || '?';

/**
 * Kroužek hráče: fotka, jinak první písmeno jména. Dekorace – jméno je vždy vedle, čtečka ho přečte jednou.
 * `dim` = pod čarou žebříčku (vybledlý jako šedé jméno). Přihlášený hráč má zlatý okraj.
 */
export function Avatar({ id, size = 's', dim = false }: { id: PlayerId; size?: AvatarSize; dim?: boolean }) {
  const ctx = useContext(PlayersContext);
  if (!ctx) return null;
  const p = ctx.byId.get(id);
  const cls = `av av-${size}${ctx.me === id ? ' me' : ''}${dim ? ' dim' : ''}${p?.avatar ? '' : ' ini'}`;
  return (
    <span className={cls} aria-hidden="true">
      {p?.avatar ? <img src={p.avatar} alt="" draggable={false} /> : initialOf(p?.name)}
    </span>
  );
}

/** Dvojice / skupina: kroužky vedle sebe (přes sebe zasunuté). */
export function Avatars({ ids, size = 's', dim = false }: { ids: PlayerId[]; size?: AvatarSize; dim?: boolean }) {
  const ctx = useContext(PlayersContext);
  if (!ctx || !ids.length) return null;
  return (
    <span className="av-stack" aria-hidden="true">
      {ids.map((id) => (
        <Avatar key={id} id={id} size={size} dim={dim} />
      ))}
    </span>
  );
}
