import { drillTimeline, matchTimeline } from '../../domain/timeline';
import type { GameEvent, Match, PlayerId } from '../../domain/types';
import { fmtDur } from '../queue';

/** Zápas – dvě dráhy (PRD 4.9, varianta B): góly a ztráty levé / pravé strany na společné časové ose. */
export function MatchLanes({ match: m, events, from, to, names }: { match: Match; events: GameEvent[]; from: number; to: number; names: Record<PlayerId, string> }) {
  const tl = matchTimeline(events, from, to);
  const nm = (ids: PlayerId[]) => ids.map((p) => names[p] ?? '?').join(' + ');
  const lane = (side: 'A' | 'B', ids: PlayerId[]) => (
    <div className={`tl-lane side-${side.toLowerCase()}`}>
      <span className="tl-name">{nm(ids)}</span>
      <ol className="tl-track" aria-label={nm(ids)}>
        {(side === 'A' ? tl.A : tl.B).map((x, i) => (
          <li
            key={i}
            className={x.kind === 'goal' ? 'tl-goal' : 'tl-loss'}
            style={{ left: `${(x.pos * 100).toFixed(2)}%` }}
            aria-label={`${x.kind === 'goal' ? `Gól ${x.n}` : 'Ztráta'} v ${fmtDur(x.at - tl.start)}`}
            title={`${x.kind === 'goal' ? `gól ${x.n}` : 'ztráta'} · ${fmtDur(x.at - tl.start)}`}
          >
            {x.n ?? ''}
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <div className="tl-match">
      {lane('A', m.sideA)}
      {lane('B', m.sideB)}
      <div className="tl-axis">
        <span />
        <span>
          <span>0:00</span>
          <span>{fmtDur(tl.end - tl.start)}</span>
        </span>
      </div>
    </div>
  );
}

/** Cvičení – řada pokusů po hráčích (varianta D): ✓ / ✗ v pořadí, nejdelší série, poloviny. */
export function DrillMarks({ players, events, names }: { players: PlayerId[]; events: GameEvent[]; names: Record<PlayerId, string> }) {
  const rows = drillTimeline(events, players);
  return (
    <div className="tl-drill">
      {players.map((p) => {
        const r = rows[p];
        if (!r.marks.length) return null;
        const inStreak = (i: number) => !!r.streak && r.streak.length > 1 && i >= r.streak.start && i < r.streak.start + r.streak.length;
        return (
          <div key={p} className="tl-drill-row">
            <span className="tl-name">{names[p] ?? '?'}</span>
            <ol className="tl-marks" aria-label={`Pokusy: ${names[p] ?? '?'}`}>
              {r.marks.map((ok, i) => (
                <li key={i} className={[ok ? 'ok' : 'ko', inStreak(i) ? 'streak' : ''].filter(Boolean).join(' ')} aria-label={`${i + 1}. pokus ${ok ? 'povedený' : 'nepovedený'}`}>
                  {ok ? '✓' : '✗'}
                </li>
              ))}
            </ol>
            <span className="tl-sum">
              {r.marks.filter(Boolean).length}/{r.marks.length}
              {r.streak && r.streak.length > 1 ? ` · nejdelší série ${r.streak.length}` : ''}
              {r.marks.length >= 4 ? ` · 1. půlka ${r.halves[0]}, 2. půlka ${r.halves[1]}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Rozbalitelný „Průběh“ – jen když má hra ťukané události. */
export function TimelineBox({ count, children, open }: { count: number; children: React.ReactNode; open?: boolean }) {
  if (!count) return null;
  return (
    <details className="tl-box" open={open} role="group" aria-label="Průběh">
      <summary>Průběh</summary>
      {children}
    </details>
  );
}
