import { useEffect, useRef } from 'react';
import { WARMUP_PHASES } from '../../domain/content';
import { rodName, WARMUP_TOTAL_SEC, warmupState, type WarmupState } from '../../domain/warmup';
import { vibrate } from '../vibrate';

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const stateKey = (s: WarmupState) => (s.done ? 'done' : `${s.index}${s.prep ? 'p' : ''}`);

interface Props {
  /** Zahájení utkání (ms); bez něj Rozcvička ještě neběží. */
  startedAt: number | undefined;
  now: number;
  /** Notebook: jeden řádek; telefon: velký odpočet a vibrace. */
  compact: boolean;
}

/** Rozcvička: timer fází od zahájení – všechny obrazovky u stolu počítají ze stejného času. */
export function WarmupTimer({ startedAt, now, compact }: Props) {
  const s = startedAt === undefined ? null : warmupState((now - startedAt) / 1000);
  const key = s ? stateKey(s) : null;
  const prev = useRef(key);
  useEffect(() => {
    if (compact || !s || prev.current === key) return;
    const first = prev.current === null;
    prev.current = key;
    if (first) return;
    if (s.done) vibrate([200, 100, 200]);
    else if (!s.prep) vibrate(200);
  }, [key, compact, s]);

  if (compact) {
    const text = !s
      ? `Rozcvička – ${WARMUP_PHASES.length} fází, ${mmss(WARMUP_TOTAL_SEC)}`
      : s.done
        ? 'Rozcvička – hotovo'
        : `Rozcvička – fáze ${s.index + 1} / ${s.total}, zbývá ${mmss(s.remainingSec)}`;
    return <p className="warmup-line">{text}</p>;
  }
  if (!s)
    return (
      <div className="warmup">
        <p className="warmup-note">Po Zahájit poběží timer, před každou fází 5 s na přípravu.</p>
        <ol className="warmup-phases">
          {WARMUP_PHASES.map((p) => (
            <li key={p.name}>
              {p.name} <span className="muted">({rodName(p.rod)}, {mmss(p.sec)})</span>
            </li>
          ))}
        </ol>
      </div>
    );
  if (s.done)
    return (
      <div className="warmup done" role="timer">
        <p className="warmup-phase">Hotovo – Rozcvička skončila.</p>
      </div>
    );
  return (
    <div className={`warmup${s.prep ? ' prep' : ''}`} role="timer" aria-live="polite">
      <p className="warmup-step">
        fáze {s.index + 1} / {s.total}
      </p>
      <p className="warmup-phase">
        {s.prep ? `Připrav se: ${s.phase.name}` : s.phase.name} <span className="muted">na {rodName(s.phase.rod) === 'dvojka' ? 'dvojce' : 'pětce'}</span>
      </p>
      <p className="warmup-clock">{mmss(s.remainingSec)}</p>
      {s.next && <p className="warmup-next">Další: {s.next.name}</p>}
    </div>
  );
}
