import type { ItemState, PauseState, QueueEntry } from '../../domain/queue';
import { fmtDur } from '../queue';

interface Props {
  queue: QueueEntry[];
  states: Map<string, ItemState>;
  pauses: PauseState[];
  now: number;
  started: boolean;
  /** Organizátor (admin / zakladatel) – jen ten ovládá trénink a pauzy. */
  manage: boolean;
  onStartTraining(): void;
  onStartPause(id: string): void;
  onNextRound(id: string): void;
  /** false = pauzy se ovládají v řádku pauzy rozpisu (Trénink tab), lišta jen pro zahájení tréninku. */
  showPause?: boolean;
}

/** Pauza, která je právě na řadě: všechna utkání před ní už jsou zahájená. */
export function currentPause(queue: QueueEntry[], states: Map<string, ItemState>, pauses: PauseState[]): PauseState | null {
  let k = 0;
  for (let i = 0; i < queue.length; i++) {
    const e = queue[i];
    if (e.kind !== 'pause') continue;
    const p = pauses[k++];
    if (p.state === 'over') continue;
    const before = queue.slice(0, i).filter((x) => x.kind === 'item');
    return before.every((x) => x.kind === 'item' && states.get(x.id)?.startedAt !== undefined) ? p : null;
  }
  return null;
}

/** PRD 4.8: zahájení tréninku a pauzy řídí organizátor. */
export function FlowBar({ queue, states, pauses, now, started, manage, onStartTraining, onStartPause, onNextRound, showPause = true }: Props) {
  if (!started)
    return (
      <div className="flow-bar" role="status">
        <span>Trénink ještě nezačal{manage ? '' : ' – zahájí ho organizátor'}.</span>
        {manage && (
          <button type="button" onClick={onStartTraining}>
            Zahájit trénink
          </button>
        )}
      </div>
    );
  if (!showPause) return null;
  const p = currentPause(queue, states, pauses);
  if (!p) return null;
  return (
    <div className="flow-bar pause" role="status">
      {p.state === 'running' ? (
        <span>
          Pauza – zbývá <strong>{fmtDur((p.endsAt ?? now) - now)}</strong>, pak se spustí další kolo.
        </span>
      ) : (
        <span>
          Pauza {p.min} min{manage ? '' : ' – další kolo spustí organizátor'}.
        </span>
      )}
      {manage && p.state === 'waiting' && (
        <button type="button" onClick={() => onStartPause(p.id)}>
          Zahájit pauzu
        </button>
      )}
      {manage && (
        <button type="button" className="ghost" onClick={() => onNextRound(p.id)}>
          {p.state === 'running' ? 'Spustit další kolo hned' : 'Spustit další kolo'}
        </button>
      )}
    </div>
  );
}

/**
 * Ovládání pauzy přímo v jejím řádku rozpisu: běžící pauza ukazuje odpočet, pauza na řadě
 * (všechna utkání před ní zahájená) nabízí organizátorovi Zahájit pauzu / Spustit další kolo.
 */
export function PauseInline({ p, current, now, manage, onStartPause, onNextRound }: {
  p: PauseState;
  current: boolean;
  now: number;
  manage: boolean;
  onStartPause(id: string): void;
  onNextRound(id: string): void;
}) {
  if (p.state === 'over') return null;
  if (p.state === 'running')
    return (
      <span className="pause-inline">
        <span>
          zbývá <strong>{fmtDur((p.endsAt ?? now) - now)}</strong>
        </span>
        {manage && (
          <button type="button" className="ghost" onClick={() => onNextRound(p.id)}>
            Spustit další kolo hned
          </button>
        )}
      </span>
    );
  if (!current) return null;
  return (
    <span className="pause-inline">
      {manage ? (
        <>
          <button type="button" onClick={() => onStartPause(p.id)}>
            Zahájit pauzu
          </button>
          <button type="button" className="ghost" onClick={() => onNextRound(p.id)}>
            Spustit další kolo
          </button>
        </>
      ) : (
        <span className="muted">další kolo spustí organizátor</span>
      )}
    </span>
  );
}
