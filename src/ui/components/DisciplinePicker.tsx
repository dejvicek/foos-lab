import { DISCIPLINES } from '../../domain/disciplines';
import { DURATION_OPTIONS, plannedMinutes } from '../../domain/plan';
import { lockedCounts } from '../../domain/training';
import type { DisciplineId, Training } from '../../domain/types';

const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
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

export function DisciplinePicker({ training, open, onChange }: { training: Training; open: boolean; onChange(next: Training): void }) {
  const used = plannedMinutes(training.plan);
  const over = used > training.durationMin;
  const locked = lockedCounts(training);
  const setCount = (id: DisciplineId, n: number) => onChange({ ...training, plan: { ...training.plan, [id]: Math.max(locked[id] ?? 0, n) } });
  return (
    <details className="disciplines" open={open}>
      <summary className="attendance-head">
        <span className="attendance-title">Disciplíny</span>
        <span className={over ? 'count-badge over' : 'count-badge'}>
          Naplánováno {hm(used)} z {hm(training.durationMin)}
        </span>
        {over && <span className="error">Nevejde se, uber kola.</span>}
      </summary>
      {(['drill', 'match', 'sim'] as const).map((kind) => (
        <div key={kind} className="disc-group">
          <h3>{KIND_TITLE[kind]}</h3>
          <ul className="disc-list">
            {DISCIPLINES.filter((d) => d.kind === kind).map((d) => {
              const n = training.plan[d.id] ?? 0;
              const min = locked[d.id] ?? 0;
              return (
                <li key={d.id} role="group" aria-label={d.name}>
                  <label>
                    <input
                      type="checkbox"
                      checked={n > 0}
                      disabled={min > 0}
                      onChange={() => setCount(d.id, n > 0 ? 0 : 1)}
                    />
                    <span>{d.name}</span>
                  </label>
                  <span className="muted">{d.min} min</span>
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
    </details>
  );
}
