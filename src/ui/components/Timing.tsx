import type { DelayRow } from '../../domain/queue';
import type { ItemState } from '../../domain/queue';
import type { Match, PlayerId } from '../../domain/types';
import { clockOf, fmtDur } from '../queue';

/**
 * Zahájení / konec utkání pro zápis (PRD 4.8). Zahájit jde jen v Moje hry (hráč utkání);
 * konec vždy potvrzuje člověk („Potvrdit konec“). Organizátor nezahajuje: zapíše skóre a potvrdí
 * (čas od vypsání utkání do potvrzení).
 */
export interface ItemTiming {
  state(itemId: string): ItemState | undefined;
  now: number;
  canWrite(itemId: string, players: PlayerId[], m?: Match): boolean;
  /** Zobrazení Moje hry – jen tady jde utkání zahájit. */
  allowStart: boolean;
  /** Organizátor (zakladatel / admin) – zapisuje bez zahájení a potvrzuje. */
  manage: boolean;
  start(itemId: string): void;
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
  onStart(): void;
  onEnd(): void;
}

/** Stopky utkání: Zahájit (jen Moje hry) a Potvrdit konec; časy se ručně neupravují. */
export function TimingBar({ state: s, now, canWrite, allowStart, manage, finished, onStart, onEnd }: BarProps) {
  if (!s) return null;
  const started = s.startedAt;
  const ended = s.endedAt;
  const playerStart = allowStart && canWrite && started === undefined && s.state === 'ready';
  // Konec potvrzuje hráč utkání v Moje hry, nebo organizátor kdekoli (i bez zahájení).
  const confirm = ended === undefined && ((manage && canWrite) || (allowStart && canWrite && started !== undefined));
  return (
    <div className={`timing ${s.state}${finished && ended === undefined ? ' finished' : ''}`}>
      <div className="timing-main">
        {started === undefined ? (
          <span className="timing-label">
            {s.state === 'ready' && s.activeAt !== null
              ? `Čeká na zahájení${now - s.activeAt >= 1000 ? ` ${fmtDur(now - s.activeAt)}` : ''}`
              : s.waitingFor === 'training'
                ? 'Trénink ještě nezačal'
                : s.waitingFor === 'pause'
                  ? 'Pauza – další kolo spustí organizátor'
                  : 'Utkání ještě není na řadě'}
          </span>
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
      {finished && ended === undefined && <p className="timing-hint">Hotovo – zkontroluj výsledek a potvrď konec.</p>}
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
            <th className="n">#</th>
            <th>Hráč</th>
            {showTrainings && <th className="n">Tréninky</th>}
            <th className="n">Utkání</th>
            <th className="n">Čekání ⌀</th>
            <th className="n">Čekání celkem</th>
            <th className="n">Hra ⌀</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.playerId}>
              <td className="n">{i + 1}.</td>
              <td>
                {open ? (
                  <button type="button" className="player-link" onClick={() => open(r.playerId)}>
                    {names[r.playerId] ?? '?'}
                  </button>
                ) : (
                  names[r.playerId] ?? '?'
                )}
              </td>
              {showTrainings && <td className="n">{r.trainings}</td>}
              <td className="n">{r.items}</td>
              <td className={i === 0 && r.waitAvg > 0 ? 'n neg' : 'n'}>{fmtDur(r.waitAvg)}</td>
              <td className="n">{fmtDur(r.waitSum)}</td>
              <td className="n">{r.playAvg === null ? '–' : fmtDur(r.playAvg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
