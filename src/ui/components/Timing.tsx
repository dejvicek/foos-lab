import type { DelayRow } from '../../domain/queue';
import type { ItemState } from '../../domain/queue';
import type { PlayerId, PlayTime } from '../../domain/types';
import { clockOf, fmtDur, msAt } from '../queue';

interface BarProps {
  state: ItemState | undefined;
  now: number;
  date: string;
  canWrite: boolean;
  onChange(p: PlayTime | null): void;
}

/** Můj stůl: stopky utkání, Zahájit / Ukončit a oprava časů (PRD 4.8). */
export function TimingBar({ state: s, now, date, canWrite, onChange }: BarProps) {
  if (!s) return null;
  const started = s.startedAt;
  const ended = s.endedAt;
  const edit = (field: keyof PlayTime, v: string) => {
    const next: PlayTime = { ...(started !== undefined ? { startedAt: started } : {}), ...(ended !== undefined ? { endedAt: ended } : {}) };
    if (v) next[field] = msAt(date, v);
    else delete next[field];
    if (field === 'startedAt' && !v) delete next.endedAt; // bez zahájení není ani konec
    onChange(Object.keys(next).length ? next : null);
  };
  return (
    <div className={`timing ${s.state}`}>
      <div className="timing-main">
        {started === undefined ? (
          <span className="timing-label">
            {s.state === 'ready' && s.activeAt !== null ? `Čeká na zahájení ${fmtDur(now - s.activeAt)}` : 'Utkání ještě není na řadě'}
          </span>
        ) : (
          <span className="timing-clock" aria-label="Doba hry">
            {fmtDur((ended ?? now) - started)}
          </span>
        )}
        {canWrite && started === undefined && (
          <button type="button" onClick={() => onChange({ startedAt: now })}>
            Zahájit
          </button>
        )}
        {canWrite && started !== undefined && ended === undefined && (
          <button type="button" className="danger" onClick={() => onChange({ startedAt: started, endedAt: now })}>
            Ukončit
          </button>
        )}
        {ended !== undefined && <span className="timing-label">dohráno</span>}
      </div>
      <div className="timing-times">
        {s.activeAt !== null && <span>Aktivní od {clockOf(s.activeAt)}</span>}
        <label>
          zahájeno{' '}
          <input type="time" aria-label="Zahájeno" disabled={!canWrite} value={started !== undefined ? clockOf(started) : ''} onChange={(e) => edit('startedAt', e.target.value)} />
        </label>
        <label>
          konec{' '}
          <input
            type="time"
            aria-label="Konec"
            disabled={!canWrite || started === undefined}
            value={ended !== undefined ? clockOf(ended) : ''}
            onChange={(e) => edit('endedAt', e.target.value)}
          />
        </label>
      </div>
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
