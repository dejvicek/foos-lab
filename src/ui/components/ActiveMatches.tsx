import type { ItemState, QueueEntry } from '../../domain/queue';
import type { PlayerId } from '../../domain/types';
import { clockOf, fmtDur, itemNames } from '../queue';

type Item = Extract<QueueEntry, { kind: 'item' }>;

interface Props {
  queue: QueueEntry[];
  states: Map<string, ItemState>;
  tables: number[];
  names: Record<PlayerId, string>;
  me: PlayerId | null;
  now: number;
  canWrite(e: Item): boolean;
  onStart(e: Item): void;
  onEnd(e: Item): void;
}

/** PRD 4.8: stoly a co se na nich právě hraje / čeká na zahájení, pod tím fronta. */
export function ActiveMatches({ queue, states, tables, names, me, now, canWrite, onStart, onEnd }: Props) {
  const items = queue.filter((e): e is Item => e.kind === 'item');
  const onTable = (t: number) => items.find((e) => {
    const s = states.get(e.id);
    return s && s.table === t && (s.state === 'ready' || s.state === 'playing');
  });
  const firstQueued = queue.findIndex((e) => e.kind === 'item' && states.get(e.id)?.state === 'queued');
  const upcoming = firstQueued < 0 ? [] : queue.slice(firstQueued).filter((e) => e.kind === 'pause' || states.get(e.id)?.state === 'queued').slice(0, 8);
  const done = items.length > 0 && items.every((e) => states.get(e.id)?.state === 'done');
  // Volný stůl: proč na něm nic není – další utkání má čas aktivace v budoucnu (začátek tréninku, pauza)?
  const nextTimed = items.map((e) => states.get(e.id)!).find((s) => s.state === 'queued' && s.activeAt !== null && s.activeAt > now);
  const firstWaiting = items.map((e) => states.get(e.id)!).find((s) => s.state === 'queued');
  const freeText = done
    ? 'vše dohráno'
    : firstWaiting?.waitingFor === 'training'
      ? 'trénink ještě nezačal'
      : firstWaiting?.waitingFor === 'pause'
        ? 'pauza'
        : nextTimed
          ? `další utkání od ${clockOf(nextTimed.activeAt!)}`
          : 'čeká se na hráče';

  return (
    <section className="active-board" aria-label="Aktivní utkání">
      <div className="active-tables">
        {tables.map((t) => {
          const e = onTable(t);
          const s = e ? states.get(e.id)! : null;
          const mine = !!e && !!me && e.players.includes(me);
          return (
            <div key={t} role="group" aria-label={`Stůl ${t}`} className={['active-table', s?.state ?? 'free', mine ? 'mine' : ''].filter(Boolean).join(' ')}>
              <div className="active-head">
                <span>
                  Stůl {t}
                  {e && ` · ${e.label}`}
                </span>
                {s?.state === 'ready' && (
                  <span className="chip wait">
                    čeká na zahájení{now - (s.activeAt ?? now) >= 1000 ? ` ${fmtDur(now - (s.activeAt ?? now))}` : ''}
                  </span>
                )}
                {s?.state === 'playing' && <span className="chip play">hraje {fmtDur(now - (s.startedAt ?? now))}</span>}
                {!e && <span className="chip free">volný</span>}
              </div>
              {e ? (
                <>
                  <div className="active-names">{itemNames(e, names)}</div>
                  {canWrite(e) &&
                    (s?.state === 'ready' ? (
                      <button type="button" onClick={() => onStart(e)}>
                        Zahájit
                      </button>
                    ) : (
                      <button type="button" className="danger" onClick={() => onEnd(e)}>
                        Ukončit
                      </button>
                    ))}
                </>
              ) : (
                <div className="active-names muted">{freeText}</div>
              )}
            </div>
          );
        })}
      </div>
      {upcoming.length > 0 && (
        <>
          <h3>Další v pořadí</h3>
          <ol className="active-queue" aria-label="Další v pořadí">
            {upcoming.map((e, i) => {
              if (e.kind === 'pause')
                return (
                  <li key={`p${i}`} className="pause">
                    Pauza {e.min} min
                  </li>
                );
              const s = states.get(e.id)!;
              const why =
                s.activeAt !== null
                  ? `od ${clockOf(s.activeAt)} na stole ${s.table}`
                  : s.waitingFor === 'training'
                    ? 'po zahájení tréninku'
                    : s.waitingFor === 'pause'
                      ? 'po pauze'
                      : s.blockedBy?.length
                    ? `čeká na: ${s.blockedBy.map((p) => names[p] ?? '?').join(', ')}`
                    : 'čeká na volný stůl';
              return (
                <li key={e.id} className={me && e.players.includes(me) ? 'mine' : undefined}>
                  <span>
                    {e.label} · {itemNames(e, names)}
                  </span>
                  <small>{why}</small>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
