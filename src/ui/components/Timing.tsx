import type { DelayRow } from '../../domain/queue';
import type { ItemState } from '../../domain/queue';
import type { Match, PlayerId } from '../../domain/types';
import { clockOf, fmtDur } from '../queue';

/** Zahájení / konec utkání pro zápis (PRD 4.8): skóre jde zadat až po zahájení. */
export interface ItemTiming {
  state(itemId: string): ItemState | undefined;
  now: number;
  canWrite(itemId: string, players: PlayerId[], m?: Match): boolean;
  start(itemId: string): void;
  end(itemId: string): void;
}

interface BarProps {
  state: ItemState | undefined;
  now: number;
  canWrite: boolean;
  onStart(): void;
  onEnd(): void;
}

/** Stopky utkání se Zahájit / Ukončit (časy se ručně neupravují). */
export function TimingBar({ state: s, now, canWrite, onStart, onEnd }: BarProps) {
  if (!s) return null;
  const started = s.startedAt;
  const ended = s.endedAt;
  return (
    <div className={`timing ${s.state}`}>
      <div className="timing-main">
        {started === undefined ? (
          <span className="timing-label">
            {s.state === 'ready' && s.activeAt !== null
              ? `Čeká na zahájení${now - s.activeAt >= 1000 ? ` ${fmtDur(now - s.activeAt)}` : ''}`
              : 'Utkání ještě není na řadě'}
          </span>
        ) : (
          <span className="timing-clock" aria-label="Doba hry">
            {fmtDur((ended ?? now) - started)}
          </span>
        )}
        {canWrite && started === undefined && (
          <button type="button" onClick={onStart}>
            Zahájit
          </button>
        )}
        {canWrite && started !== undefined && ended === undefined && (
          <button type="button" className="danger" onClick={onEnd}>
            Ukončit
          </button>
        )}
        {ended !== undefined && <span className="timing-label">dohráno</span>}
      </div>
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
