import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { drillTimeline, leader, matchProgress, type DrillRow, type MatchProgress } from '../../domain/timeline';
import type { GameEvent, Match, PlayerId } from '../../domain/types';
import { loadTimelineView, saveTimelineView, subscribeTimelineView, type TimelineView } from '../../storage/prefs';
import { fmtDur } from '../queue';

const MIN = 60_000;

/** Zobrazení Průběhu – společné pro všechny karty, pamatuje si ho zařízení. */
function useTimelineView(): TimelineView {
  return useSyncExternalStore(subscribeTimelineView, loadTimelineView, () => 'column');
}

function ViewSwitch({ view }: { view: TimelineView }) {
  return (
    <div className="segmented tl-switch" role="group" aria-label="Zobrazení průběhu">
      {(['column', 'curve'] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => saveTimelineView(v)}>
          {v === 'column' ? 'Sloupec' : 'Křivka'}
        </button>
      ))}
    </div>
  );
}

/** Šířka prvku (pro SVG křivky); ve sbaleném Průběhu nebo bez ResizeObserver výchozí. */
function useWidth(fallback = 320) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      if (el.clientWidth > 0) setW(el.clientWidth);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const sideCls = (s: 'A' | 'B') => (s === 'A' ? 'side-a' : 'side-b');

/** Stav skóre; vedoucí číslo tučně. */
function Score({ score: [a, b] }: { score: [number, number] }) {
  return (
    <>
      {a > b ? <b>{a}</b> : a}
      <span className="tl-colon">:</span>
      {b > a ? <b>{b}</b> : b}
    </>
  );
}

const leadCls = (s: [number, number]) => {
  const l = leader(s);
  return l === 'A' ? ' lead-a' : l === 'B' ? ' lead-b' : '';
};

/** Zápas – sloupec (PRD 4.9): řádek na událost, góly levé vlevo, pravé vpravo, uprostřed stav podbarvený podle vedoucího. */
function MatchColumn({ p, nameA, nameB, unit }: { p: MatchProgress; nameA: string; nameB: string; unit: 'gól' | 'set' }) {
  const scen = p.initial[0] > 0 || p.initial[1] > 0;
  const Unit = unit === 'gól' ? 'Gól' : 'Set';
  let current = p.initial;
  return (
    <div className="tl-col" role="table" aria-label="Průběh po událostech">
      <div className="tl-col-row tl-col-head" role="row">
        <span role="columnheader">Čas</span>
        <span role="columnheader" className="tl-col-a">
          {nameA}
          <i className="tl-dot side-a" />
        </span>
        <span role="columnheader" className="tl-col-s">
          stav
        </span>
        <span role="columnheader" className="tl-col-b">
          <i className="tl-dot side-b" />
          {nameB}
        </span>
      </div>
      <div className="tl-col-row" role="row" aria-label={`${scen ? 'Start' : 'Začátek'} ${p.initial.join(':')}`}>
        <span role="cell" className="tl-col-t">
          {scen ? 'start' : '0:00'}
        </span>
        <span role="cell" className="tl-col-a" />
        <span role="cell" className={`tl-col-s${leadCls(p.initial)}`}>
          <Score score={p.initial} />
        </span>
        <span role="cell" className="tl-col-b" />
      </div>
      {p.steps.map((s, i) => {
        const t = fmtDur(s.at - p.start);
        const name = s.side === 'A' ? nameA : nameB;
        const mark =
          s.kind === 'goal' ? (
            <span className={`tl-pill ${sideCls(s.side)}`}>{unit}</span>
          ) : s.side === 'A' ? (
            <>
              <span className="tl-loss-lbl">ztráta</span>
              <i className="tl-ring side-a" />
            </>
          ) : (
            <>
              <i className="tl-ring side-b" />
              <span className="tl-loss-lbl">ztráta</span>
            </>
          );
        if (s.kind === 'goal') current = s.score;
        return (
          <div
            key={i}
            className="tl-col-row"
            role="row"
            aria-label={s.kind === 'goal' ? `${Unit}: ${name}, ${s.score.join(':')} v ${t}` : `Ztráta: ${name} v ${t}`}
          >
            <span role="cell" className="tl-col-t">
              {t}
            </span>
            <span role="cell" className="tl-col-a">
              {s.side === 'A' && mark}
            </span>
            <span role="cell" className={`tl-col-s${leadCls(current)}`}>
              {s.kind === 'goal' && <Score score={s.score} />}
            </span>
            <span role="cell" className="tl-col-b">
              {s.side === 'B' && mark}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Zápas – křivka vedení (PRD 4.9): rozdíl skóre na časové ose, nad nulou vede levá, pod nulou pravá. */
function MatchCurve({ p, nameA, nameB, unit }: { p: MatchProgress; nameA: string; nameB: string; unit: 'gól' | 'set' }) {
  const [ref, width] = useWidth();
  const W = Math.max(220, width);
  // Nahoře popisek levé strany, pod grafem popisek pravé, řada ztrát a čas.
  const H = 222, L = 4, R = 38, T = 26, B = 58;
  const pw = W - L - R, ph = H - T - B;
  const x = (pos: number) => L + pw * pos;
  const mid = T + ph / 2;
  // Rezerva nad krajním náskokem, aby se popisky stavu vešly do grafu.
  const y = (d: number) => mid - (d * (ph / 2)) / (p.maxLead + 0.6);
  const d0 = p.initial[0] - p.initial[1];
  const goals = p.steps.filter((s) => s.kind === 'goal');
  const losses = p.steps.filter((s) => s.kind === 'loss');
  const diff = (s: [number, number]) => s[0] - s[1];
  const steps = goals.map((g) => ` H${x(g.pos).toFixed(1)} V${y(diff(g.score)).toFixed(1)}`).join('') + ` H${x(1)}`;
  const line = `M${x(0)},${y(d0)}${steps}`;
  const area = `M${x(0)},${mid} V${y(d0)}${steps} V${mid} Z`;
  const id = `tl${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const total = p.end - p.start;
  const ticks: number[] = [];
  for (let m = MIN; m < total; m += MIN) ticks.push(m / total);
  const grid: number[] = [];
  for (let d = -p.maxLead; d <= p.maxLead; d++) if (d) grid.push(d);
  const ly = T + ph + 30;
  return (
    <div ref={ref} className="tl-curve">
      <svg width={W} height={H} role="img" aria-label={`Křivka vedení, konečný stav ${p.score.join(':')}`}>
        <defs>
          <clipPath id={`${id}u`}>
            <rect x={0} y={0} width={W} height={mid} />
          </clipPath>
          <clipPath id={`${id}d`}>
            <rect x={0} y={mid} width={W} height={H - mid} />
          </clipPath>
        </defs>
        {grid.map((d) => (
          <line key={d} className="tl-grid" x1={L} x2={L + pw} y1={y(d)} y2={y(d)} />
        ))}
        <path className="tl-area-a" d={area} clipPath={`url(#${id}u)`} />
        <path className="tl-area-b" d={area} clipPath={`url(#${id}d)`} />
        <line className="tl-axis-line" x1={L} x2={L + pw} y1={mid} y2={mid} />
        <text className="tl-side-lbl side-a" x={L} y={12}>
          ▲ vede {nameA}
        </text>
        <text className="tl-side-lbl side-b" x={L} y={T + ph + 14}>
          ▼ vede {nameB}
        </text>
        <path className="tl-step" d={line} />
        {goals.map((g, i) => {
          const up = g.side === 'A';
          const cy = y(diff(g.score));
          return (
            <g key={i}>
              <circle className={`tl-pt ${sideCls(g.side)}`} cx={x(g.pos)} cy={cy} r={5}>
                <title>{`${unit === 'gól' ? 'Gól' : 'Set'}: ${up ? nameA : nameB} v ${fmtDur(g.at - p.start)} → ${g.score.join(':')}`}</title>
              </circle>
              <text className="tl-pt-lbl" textAnchor="middle" x={x(g.pos)} y={up ? cy - 9 : cy + 17}>
                {g.score.join(':')}
              </text>
            </g>
          );
        })}
        <text className="tl-end-lbl" x={x(1) + 5} y={y(diff(p.score)) + 5}>
          {p.score.join(':')}
        </text>
        {losses.map((l, i) => (
          <g key={i}>
            <circle className="tl-loss-pt" cx={x(l.pos)} cy={ly} r={5}>
              <title>{`Ztráta: ${l.side === 'A' ? nameA : nameB} v ${fmtDur(l.at - p.start)}`}</title>
            </circle>
            <circle className={`tl-fill ${sideCls(l.side)}`} cx={x(l.pos)} cy={ly} r={2} />
          </g>
        ))}
        {ticks.map((t) => (
          <line key={t} className="tl-tick" x1={x(t)} x2={x(t)} y1={H - 14} y2={H - 10} />
        ))}
        <text className="tl-time" x={L} y={H - 1}>
          0:00
        </text>
        <text className="tl-time" textAnchor="end" x={x(1)} y={H - 1}>
          {fmtDur(total)}
        </text>
      </svg>
    </div>
  );
}

/** Zápas (PRD 4.9): přepínač Sloupec / Křivka. U simulace jsou „góly“ sety. */
export function MatchTimeline({ match: m, events, from, to, names }: { match: Match; events: GameEvent[]; from: number; to: number; names: Record<PlayerId, string> }) {
  const view = useTimelineView();
  const nm = (ids: PlayerId[]) => ids.map((id) => names[id] ?? '?').join(' + ');
  const sim = m.block === 'sim';
  const p = matchProgress(events, from, to, sim ? [0, 0] : (m.start ?? [0, 0]));
  const props = { p, nameA: nm(m.sideA), nameB: nm(m.sideB), unit: sim ? ('set' as const) : ('gól' as const) };
  return (
    <>
      <ViewSwitch view={view} />
      {view === 'column' ? <MatchColumn {...props} /> : <MatchCurve {...props} />}
    </>
  );
}

const drillSummary = (r: DrillRow) =>
  `${r.marks.filter(Boolean).length}/${r.marks.length}` +
  (r.streak && r.streak.length > 1 ? ` · nejdelší série ${r.streak.length}` : '') +
  (r.marks.length >= 4 ? ` · 1. půlka ${r.halves[0]}, 2. půlka ${r.halves[1]}` : '');

const inStreak = (r: DrillRow, i: number) => !!r.streak && r.streak.length > 1 && i >= r.streak.start && i < r.streak.start + r.streak.length;

/** Barva hráče v cvičení: 1. zlatá, 2. tmavá, další černá (čárkovaně v křivce). */
const playerCls = (i: number) => `pl-${Math.min(i, 2)}`;

/** Cvičení – sloupec (PRD 4.9): řádek = pokus, sloupec = hráč; nad 10 pokusů dvě půlky vedle sebe. */
function DrillColumn({ rows, names }: { rows: { p: PlayerId; r: DrillRow; i: number }[]; names: Record<PlayerId, string> }) {
  const n = Math.max(...rows.map((x) => x.r.marks.length));
  const half = n > 10 ? Math.ceil(n / 2) : n;
  const blocks: [number, number][] = half < n ? [[0, half], [half, n]] : [[0, n]];
  return (
    <div className="tl-dcol">
      {blocks.map(([from, to]) => (
        <div
          key={from}
          className="tl-dcol-b"
          role="table"
          aria-label={blocks.length > 1 ? `Pokusy ${from + 1}–${to}` : 'Pokusy'}
          style={{ gridTemplateColumns: `auto repeat(${rows.length}, minmax(0, 1fr))` }}
        >
          <div className="tl-col-row" role="row">
            <span role="columnheader" className="tl-dh">
              pokus
            </span>
            {rows.map(({ p, i }) => (
              <span key={p} role="columnheader" className="tl-dh">
                <i className={`tl-dot ${playerCls(i)}`} />
                {names[p] ?? '?'}
              </span>
            ))}
          </div>
          {Array.from({ length: to - from }, (_, k) => from + k).map((a) => (
            <div key={a} className="tl-col-row" role="row">
              <span role="cell" className="tl-dn">
                {a + 1}
              </span>
              {rows.map(({ p, r, i }) => {
                const ok = r.marks[a];
                const name = names[p] ?? '?';
                return (
                  <span key={p} role="cell" aria-label={ok === undefined ? undefined : `${name}, ${a + 1}. pokus ${ok ? 'povedený' : 'nepovedený'}`}>
                    {ok !== undefined && (
                      <span className={['tl-try', ok ? `ok ${playerCls(i)}` : 'ko', inStreak(r, a) ? 'streak' : ''].filter(Boolean).join(' ')}>
                        {ok ? r.running[a] : '✗'}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          ))}
          {blocks.length > 1 && (
            <div className="tl-col-row tl-dsum" role="row">
              <span role="cell" className="tl-dn">
                {from + 1}–{to}
              </span>
              {rows.map(({ p, r }) => {
                const part = r.marks.slice(from, to);
                return (
                  <span key={p} role="cell">
                    {part.filter(Boolean).length}/{part.length}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Cvičení – křivky (PRD 4.9): vodorovně pokus, svisle povedené celkem; čárkovaně „vše povedené“. */
function DrillCurve({ rows, names }: { rows: { p: PlayerId; r: DrillRow; i: number }[]; names: Record<PlayerId, string> }) {
  const [ref, width] = useWidth();
  const W = Math.max(220, width);
  const H = 200, L = 22, R = 30, T = 10, B = 24;
  const n = Math.max(...rows.map((x) => x.r.marks.length));
  const pw = W - L - R, ph = H - T - B;
  const x = (a: number) => L + (pw * a) / n;
  const y = (h: number) => T + ph - (ph * h) / n;
  const step = n > 10 ? 5 : n > 4 ? 2 : 1;
  const levels: number[] = [];
  for (let g = step; g <= n; g += step) levels.push(g);
  // Popisky výsledků vpravo: rozestoupit, aby se nepřekrývaly.
  const ends = rows.map(({ p, r, i }) => ({ p, i, hits: r.running[r.running.length - 1] ?? 0, y: y(r.running[r.running.length - 1] ?? 0) + 4 })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + 13);
  return (
    <div ref={ref} className="tl-curve">
      <svg width={W} height={H} role="img" aria-label="Povedené pokusy po pokusech">
        {levels.map((g) => (
          <g key={g}>
            <line className="tl-grid" x1={L} x2={L + pw} y1={y(g)} y2={y(g)} />
            <text className="tl-time" textAnchor="end" x={L - 4} y={y(g) + 3}>
              {g}
            </text>
          </g>
        ))}
        <line className="tl-axis-line" x1={L} x2={L + pw} y1={y(0)} y2={y(0)} />
        <text className="tl-time" textAnchor="end" x={L - 4} y={y(0) + 3}>
          0
        </text>
        <line className="tl-diag" x1={x(0)} y1={y(0)} x2={x(n)} y2={y(n)} />
        <text className="tl-side-lbl" textAnchor="end" x={x(n * 0.62)} y={y(n * 0.62) - 6}>
          vše povedené
        </text>
        {rows.map(({ p, r, i }) => (
          <g key={p}>
            <polyline
              className={`tl-pline ${playerCls(i)}`}
              points={[[x(0), y(0)], ...r.running.map((h, a) => [x(a + 1), y(h)])].map((pt) => pt.map((v) => v.toFixed(1)).join(',')).join(' ')}
            />
            {r.marks.map((ok, a) =>
              ok ? null : (
                <circle key={a} className="tl-loss-pt" cx={x(a + 1)} cy={y(r.running[a])} r={3.5}>
                  <title>{`${names[p] ?? '?'}, ${a + 1}. pokus nepovedený`}</title>
                </circle>
              ),
            )}
          </g>
        ))}
        {ends.map((e) => (
          <text key={e.p} className={`tl-end-lbl ${playerCls(e.i)}`} x={x(n) + 5} y={e.y}>
            {e.hits}
          </text>
        ))}
        <text className="tl-time" textAnchor="middle" x={x(1)} y={H - 6}>
          1
        </text>
        <text className="tl-time" textAnchor="middle" x={x(n)} y={H - 6}>
          {n}
        </text>
        {n >= 6 && (
          <text className="tl-time" textAnchor="middle" x={x((n + 1) / 2)} y={H - 6}>
            pokus
          </text>
        )}
      </svg>
    </div>
  );
}

/** Cvičení (PRD 4.9): přepínač Sloupec / Křivka, pod tím souhrn každého hráče. */
export function DrillTimeline({ players, events, names }: { players: PlayerId[]; events: GameEvent[]; names: Record<PlayerId, string> }) {
  const view = useTimelineView();
  const all = drillTimeline(events, players);
  const rows = players.map((p, i) => ({ p, r: all[p], i })).filter((x) => x.r.marks.length > 0);
  if (!rows.length) return null;
  return (
    <>
      <ViewSwitch view={view} />
      {view === 'column' ? <DrillColumn rows={rows} names={names} /> : <DrillCurve rows={rows} names={names} />}
      <div className="tl-sums">
        {rows.map(({ p, r, i }) => (
          <p key={p} className="tl-sum">
            <i className={`tl-dot ${playerCls(i)}`} />
            <b>{names[p] ?? '?'}</b> <span>{drillSummary(r)}</span>
          </p>
        ))}
      </div>
    </>
  );
}

/** Rozbalitelný „Průběh“ – jen když má hra ťukané události. */
export function TimelineBox({ count, children, open }: { count: number; children: ReactNode; open?: boolean }) {
  if (!count) return null;
  return (
    <details className="tl-box" open={open} role="group" aria-label="Průběh">
      <summary>Průběh</summary>
      {children}
    </details>
  );
}
