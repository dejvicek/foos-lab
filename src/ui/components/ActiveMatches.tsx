import { WarmupTimer } from './WarmupTimer';
import { matchState } from '../../domain/matchFormat';
import { useState } from 'react';
import type { ItemState, QueueEntry } from '../../domain/queue';
import type { SoloMetricDef } from '../../domain/solo';
import { parseScoreValue } from '../../domain/standings';
import type { MatchId, PlayerId, Score, SoloKey, Training } from '../../domain/types';
import { clockOf, fmtDur, itemNames } from '../queue';
import { ScorePicker } from './ScorePicker';

type Item = Extract<QueueEntry, { kind: 'item' }>;

interface Props {
  queue: QueueEntry[];
  states: Map<string, ItemState>;
  tables: number[];
  names: Record<PlayerId, string>;
  me: PlayerId | null;
  now: number;
  canWrite(e: Item): boolean;
  /** Organizátor: potvrzuje konec (i bez zahájení). Zahájit jde jen v Moje hry. */
  manage: boolean;
  onEnd(e: Item): void;
  /** Přechod do Moje hry (moje utkání čeká na zahájení). */
  onMyGame?(): void;
  /** Organizátor zadá nahlášený výsledek (hráči nepoužívají telefon). */
  entry?: ResultEntryProps;
}

/** Zápis výsledku z Živě: skóre zápasu, u cvičení počty hráčů. */
export interface ResultEntryProps {
  training: Training;
  onScore(id: MatchId, s: Score): void;
  onSolo(playerId: PlayerId, key: SoloKey, value: number | null): void;
  /** Metrika a klíč výsledku cvičení pro utkání ve frontě (null = není cvičení se zápisem). */
  drillOf(e: Item): { def: SoloMetricDef; key: SoloKey } | null;
}

function ResultEntry({ e, table, names, entry }: { e: Item; table: number; names: Record<PlayerId, string>; entry: ResultEntryProps }) {
  const label = `${e.label}, stůl ${table}`;
  if (e.match) {
    // BO zápas: výběr pro každý leg, který se hraje nebo odehrál.
    const legs = (e.match.bestOf ?? 1) > 1 ? matchState(e.match, entry.training.scores).legs.map((l) => l.leg) : [e.match];
    return (
      <>
        {legs.map((leg) => (
          <ScorePicker
            key={leg.id}
            label={legs.length > 1 || leg.legNo ? `${label}, leg ${leg.legNo ?? 1}` : label}
            match={leg}
            score={entry.training.scores[leg.id]}
            names={names}
            disabled={false}
            onChange={(sc) => entry.onScore(leg.id, sc)}
          />
        ))}
      </>
    );
  }
  const drill = entry.drillOf(e);
  if (!drill) return null;
  // Čistá desítka se měří na čas z jednotlivých pokusů – číslem zpětně zapsat nejde.
  if (drill.def.streak) return <p className="note">{drill.def.name} se zapisuje ťukáním pokusů v Moje hry.</p>;
  return (
    <div className="active-entry-drill">
      <small className="muted">{drill.def.what}</small>
      {e.players.map((p) => {
        const v = entry.training.soloResults[p]?.[drill.key];
        return (
          <label key={p} className="solo-line">
            <span>{names[p] ?? '?'}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={drill.def.max}
              placeholder="–"
              aria-label={`${label}: ${names[p] ?? '?'}`}
              value={v === undefined ? '' : String(v)}
              onChange={(ev) => {
                const n = parseScoreValue(ev.target.value);
                if (n !== null && n > drill.def.max) return;
                entry.onSolo(p, drill.key, n);
              }}
            />
          </label>
        );
      })}
    </div>
  );
}

/** PRD 4.8: stoly a co se na nich právě hraje / čeká na zahájení, pod tím fronta. */
export function ActiveMatches({ queue, states, tables, names, me, now, canWrite, manage, onEnd, onMyGame, entry }: Props) {
  // Otevřený zápis výsledku (ID utkání).
  const [open, setOpen] = useState<string | null>(null);
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
          // Rozcvička: nic se nezapisuje, jen timer a potvrzení konce.
          const warmup = e?.discipline === 'warmup';
          return (
            <div key={t} role="group" aria-label={`Stůl ${t}`} className={['active-table', s?.state ?? 'free', mine ? 'mine' : '', e && open === e.id ? 'entry-open' : ''].filter(Boolean).join(' ')}>
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
                {s?.state === 'playing' && !warmup && <span className="chip play">hraje {fmtDur(now - (s.startedAt ?? now))}</span>}
                {!e && <span className="chip free">volný</span>}
              </div>
              {e ? (
                <>
                  <div className="active-names">{itemNames(e, names)}</div>
                  {warmup && s?.state === 'playing' && <WarmupTimer startedAt={s.startedAt} now={now} compact />}
                  {manage && canWrite(e) ? (
                    // Organizátor: nahlášený výsledek zadá a potvrdí konec; rozehrané (z telefonu) jen potvrdí.
                    <div className="active-actions">
                      {open === e.id && entry && <ResultEntry e={e} table={t} names={names} entry={entry} />}
                      {open !== e.id && entry && !warmup && (
                        <button type="button" className={s?.state === 'playing' ? 'link' : undefined} onClick={() => setOpen(e.id)}>
                          Zadat výsledek
                        </button>
                      )}
                      {(s?.state === 'playing' || open === e.id || !entry || warmup) && (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            onEnd(e);
                            setOpen(null);
                          }}
                        >
                          Potvrdit konec
                        </button>
                      )}
                    </div>
                  ) : (
                    mine &&
                    s?.state === 'ready' &&
                    onMyGame && (
                      <button type="button" onClick={onMyGame}>
                        Zahájit v Moje hry
                      </button>
                    )
                  )}
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
