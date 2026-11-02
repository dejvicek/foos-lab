import { DISCIPLINES } from '../../domain/disciplines';
import { DURATION_OPTIONS, plannedMinutes, SIM_MIN_PLAYERS } from '../../domain/plan';
import { lockedCounts } from '../../domain/training';
import type { DisciplineId, Training } from '../../domain/types';

export const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const KIND_TITLE = { drill: 'Cvičení', match: 'Zápasy', sim: 'Tým' } as const;

/** PRD 4.6 / 7: délka tréninku, výběr disciplín a počty kol. */
export function DurationSelect({ training, onChange }: { training: Training; onChange(next: Training): void }) {
  return (
    <div className="field">
      <label htmlFor="t-duration">Délka tréninku</label>
      <select id="t-duration" value={training.durationMin} onChange={(e) => onChange({ ...training, durationMin: Number(e.target.value) })}>
        {DURATION_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {hm(m)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DisciplinePicker({ training, open, onChange, bare }: { training: Training; open: boolean; onChange(next: Training): void; bare?: boolean }) {
  const used = plannedMinutes(training.plan, training.attendees.length, training.breaks);
  const over = used > training.durationMin;
  const locked = lockedCounts(training);
  const setCount = (id: DisciplineId, n: number) => onChange({ ...training, plan: { ...training.plan, [id]: Math.max(locked[id] ?? 0, n) } });
  const badge = (
    <>
      <span className={over ? 'count-badge over' : 'count-badge'}>
        Naplánováno {hm(used)} z {hm(training.durationMin)}
      </span>
      {over && <span className="error">Nevejde se, uber kola.</span>}
    </>
  );
  const body = (
    <>
      {(['drill', 'match', 'sim'] as const).map((kind) => (
        <div key={kind} className="disc-group">
          <h3>{KIND_TITLE[kind]}</h3>
          <ul className="disc-list">
            {DISCIPLINES.filter((d) => d.kind === kind).map((d) => {
              const simOff = d.kind === 'sim' && training.attendees.length < SIM_MIN_PLAYERS;
              const n = simOff ? 0 : (training.plan[d.id] ?? 0);
              const min = locked[d.id] ?? 0;
              return (
                <li key={d.id} role="group" aria-label={d.name}>
                  <label>
                    <input
                      type="checkbox"
                      checked={n > 0}
                      disabled={min > 0 || simOff}
                      onChange={() => setCount(d.id, n > 0 ? 0 : 1)}
                    />
                    <span>{d.name}</span>
                  </label>
                  <span className="muted">{simOff ? `potřebuje aspoň ${SIM_MIN_PLAYERS} hráče` : `${d.min} min`}</span>
                  {n > 0 && d.kind !== 'sim' && (
                    <span className="stepper">
                      <button type="button" className="icon" aria-label={`Ubrat kolo: ${d.name}`} disabled={n <= Math.max(1, min)} onClick={() => setCount(d.id, n - 1)}>
                        −
                      </button>
                      <span>{n} ×</span>
                      <button type="button" className="icon" aria-label={`Přidat kolo: ${d.name}`} onClick={() => setCount(d.id, n + 1)}>
                        +
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="note">Cvičení má tolik kol, aby se ve dvojicích vystřídali všichni. Zbylý čas appka doplní zápasy; počty jde upravit. Odehraná kola jsou zamčená.</p>
    </>
  );
  if (bare)
    return (
      <div className="disciplines bare">
        <p className="count-line">{badge}</p>
        {body}
      </div>
    );
  return (
    <details className="disciplines step" open={open}>
      <summary className="attendance-head">
        <span className="attendance-title">Disciplíny</span>
        {badge}
      </summary>
      {body}
    </details>
  );
}
