import type { DelayRow } from '../../domain/queue';
import type { ItemState } from '../../domain/queue';
import type { Match, PlayerId } from '../../domain/types';
import { clockOf, fmtDur } from '../queue';
import { isShamed, ShameRank, Snail } from './Rank';

/**
 * Zahájení / konec utkání pro zápis (PRD 4.8). Od 18. 11. 2026 místo Zahájit „Připraven“: každá strana
 * zápasu (u cvičení každý hráč) se přihlásí, utkání začne, až jsou připravení všichni. Přihlásit se jde
 * v Moje hry, organizátor kdekoli. Konec potvrzuje člověk („Potvrdit konec“); dohraný výsledek nejdéle
 * 15 s, pak utkání skončí samo (10. 11. 2026). Organizátor zapíše skóre i bez zahájení a potvrdí.
 */
export interface ReadySlot {
  /** Strana zápasu `A` / `B`, u cvičení ID hráče. */
  key: string;
  /** Jména strany / hráč. */
  label: string;
  /** Smí ji přihlášený ohlásit? */
  can: boolean;
}

export interface ItemTiming {
  state(itemId: string): ItemState | undefined;
  now: number;
  canWrite(itemId: string, players: PlayerId[], m?: Match): boolean;
  /** Zobrazení Moje hry – jen tady jde utkání zahájit. */
  allowStart: boolean;
  /** Organizátor (zakladatel / admin) – zapisuje bez zahájení a potvrzuje. */
  manage: boolean;
  /** Za kolik ms utkání s dohraným výsledkem skončí samo (null = neskončí). */
  autoEndIn?(itemId: string): number | null;
  start(itemId: string): void;
  /** Smí přihlášený ohlásit připravenost klíče (strana A / B, hráč cvičení)? */
  canReady?(key: string, e: { match?: Match; players: PlayerId[] }): boolean;
  /** Připravenost: přihlásit / zrušit; `keys` = všichni, na koho se čeká. */
  ready?(itemId: string, key: string, on: boolean, keys: string[]): void;
  /** Potvrzení konce; u nezahájeného utkání (organizátor) se počítá od vypsání. */
  end(itemId: string): void;
}

interface BarProps {
  state: ItemState | undefined;
  now: number;
  canWrite: boolean;
  allowStart: boolean;
  manage: boolean;
  /** Výsledek je dohraný (leg / všechny pokusy) – vyzvat k potvrzení konce. */
  finished?: boolean;
  /** Vlastní odpočet (Rozcvička): bez stopek „Doba hry“ a bez výzvy ke kontrole výsledku. */
  countdown?: boolean;
  /** Dohraný výsledek: za kolik ms utkání skončí samo (null = čeká na potvrzení bez limitu). */
  autoEndIn?: number | null;
  /** Připravenost (18. 11. 2026): strany / hráči; bez ní tlačítko Zahájit jako dřív. */
  slots?: ReadySlot[];
  onReady?(key: string, on: boolean): void;
  onStart(): void;
  onEnd(): void;
}

/** „Připraveni: Ada + Bára ✓ 18:02 · čeká: Cyril + Dan“ a tlačítka Připraven / Zrušit pro ty, za které smím. */
function ReadyRow({ s, slots, now, onReady }: { s: ItemState; slots: ReadySlot[]; now: number; onReady(key: string, on: boolean): void }) {
  const mine = slots.filter((x) => x.can);
  const many = mine.length > 1;
  return (
    <div className="ready-row" role="group" aria-label="Připravenost">
      <ul className="ready-list">
        {slots.map((x) => {
          const at = s.ready?.[x.key];
          return (
            <li key={x.key} className={at !== undefined ? 'ready on' : 'ready'}>
              <span className="ready-who">{x.label}</span>{' '}
              {at !== undefined ? (
                <span className="ready-state">✓ připraven{x.key === 'A' || x.key === 'B' ? 'i' : ''} {clockOf(at)}</span>
              ) : (
                <span className="ready-state muted">
                  čeká{s.activeAt !== null && now - s.activeAt >= 1000 ? ` ${fmtDur(now - s.activeAt)}` : ''}
                </span>
              )}
              {x.can &&
                (at === undefined ? (
                  <button type="button" onClick={() => onReady(x.key, true)} aria-label={many ? `Připraven: ${x.label}` : 'Připraven'}>
                    {many ? `Připraven – ${x.label}` : 'Připraven'}
                  </button>
                ) : (
                  <button type="button" className="link" onClick={() => onReady(x.key, false)} aria-label={`Zrušit připravenost: ${x.label}`}>
                    zrušit
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Stopky utkání: Zahájit (jen Moje hry) a Potvrdit konec; časy se ručně neupravují. */
export function TimingBar({ state: s, now, canWrite, allowStart, manage, finished, countdown, autoEndIn, slots, onReady, onStart, onEnd }: BarProps) {
  if (!s) return null;
  const started = s.startedAt;
  const ended = s.endedAt;
  // Připravenost: na řadě, nezahájené; hlásit jde v Moje hry, organizátor kdekoli.
  const readyMode = !!slots && !!onReady;
  const showReady = readyMode && started === undefined && ended === undefined && s.state === 'ready' && (allowStart || manage);
  const playerStart = !readyMode && allowStart && canWrite && started === undefined && s.state === 'ready';
  // Konec potvrzuje hráč utkání v Moje hry, nebo organizátor kdekoli (i bez zahájení).
  const confirm = ended === undefined && ((manage && canWrite) || (allowStart && canWrite && started !== undefined));
  return (
    <div className={`timing ${s.state}${finished && ended === undefined ? ' finished' : ''}`}>
      <div className="timing-main">
        {started === undefined ? (
          <span className="timing-label">
            {s.state === 'ready' && s.activeAt !== null
              ? `${readyMode ? 'Čeká na připravenost' : 'Čeká na zahájení'}${now - s.activeAt >= 1000 ? ` ${fmtDur(now - s.activeAt)}` : ''}`
              : s.waitingFor === 'training'
                ? 'Trénink ještě nezačal'
                : s.waitingFor === 'pause'
                  ? 'Pauza – další kolo spustí organizátor'
                  : 'Utkání ještě není na řadě'}
          </span>
        ) : countdown ? (
          <span className="timing-label">{ended === undefined ? 'běží' : ''}</span>
        ) : (
          <span className="timing-clock" aria-label="Doba hry">
            {fmtDur((ended ?? now) - started)}
          </span>
        )}
        {playerStart && (
          <button type="button" onClick={onStart}>
            Zahájit
          </button>
        )}
        {confirm && !playerStart && (
          <button type="button" className={finished ? undefined : 'ghost'} onClick={onEnd}>
            {started === undefined ? 'Potvrdit' : 'Potvrdit konec'}
          </button>
        )}
        {ended !== undefined && <span className="timing-label">dohráno</span>}
      </div>
      {showReady && <ReadyRow s={s} slots={slots!} now={now} onReady={onReady!} />}
      {finished && !countdown && ended === undefined && (
        <p className="timing-hint" role="status">
          {autoEndIn !== null && autoEndIn !== undefined
            ? `Hotovo – zkontroluj výsledek. Utkání skončí samo za ${Math.ceil(autoEndIn / 1000)} s; oprava výsledku odpočet zastaví.`
            : 'Hotovo – zkontroluj výsledek a potvrď konec.'}
        </p>
      )}
      {(s.activeAt !== null || started !== undefined) && (
        <div className="timing-times">
          {s.activeAt !== null && <span>aktivní od {clockOf(s.activeAt)}</span>}
          {started !== undefined && <span>zahájeno {clockOf(started)}</span>}
          {ended !== undefined && <span>konec {clockOf(ended)}</span>}
        </div>
      )}
    </div>
  );
}

interface TableProps {
  rows: (DelayRow & { trainings?: number })[];
  names: Record<PlayerId, string>;
  showTrainings?: boolean;
  open?(id: PlayerId): void;
}

/** Zdržovači: kdo nejdéle čeká, než zahájí utkání, a jak dlouho hraje. */
export function DelayTable({ rows, names, showTrainings, open }: TableProps) {
  return (
    <div className="wrap">
      <table aria-label="Zdržovači" className="delay-table">
        <thead>
          <tr>
            <th className="n rank">#</th>
            <th>Hráč</th>
            {showTrainings && <th className="n">Tréninky</th>}
            <th className="n">Utkání</th>
            <th className="n">Čekání ⌀</th>
            <th className="n">Čekání celkem</th>
            <th className="n">Hra ⌀</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const shamed = isShamed(i + 1, r.waitSum > 0);
            return (
            <tr key={r.playerId} className={shamed ? 'shame shame-1' : undefined}>
              <td className="n rank">
                <ShameRank place={i + 1} shamed={shamed} />
              </td>
              <td>
                <span className="delay-who">
                  {open ? (
                    <button type="button" className="player-link" onClick={() => open(r.playerId)}>
                      {names[r.playerId] ?? '?'}
                    </button>
                  ) : (
                    names[r.playerId] ?? '?'
                  )}
                  {shamed && <Snail big />}
                  {shamed && <span className="shame-tag">Brzda</span>}
                </span>
              </td>
              {showTrainings && <td className="n">{r.trainings}</td>}
              <td className="n">{r.items}</td>
              <td className={i === 0 && r.waitAvg > 0 ? 'n neg' : 'n'}>{fmtDur(r.waitAvg)}</td>
              <td className="n">{fmtDur(r.waitSum)}</td>
              <td className="n">{r.playAvg === null ? '–' : fmtDur(r.playAvg)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
