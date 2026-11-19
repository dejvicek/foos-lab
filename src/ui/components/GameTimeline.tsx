import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { drillTimeline, matchProgress, type DrillRow, type MatchProgress } from '../../domain/timeline';
import { setScores } from '../../domain/legState';
import type { GameEvent, Match, PlayerId } from '../../domain/types';
import { fmtDur } from '../queue';


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

/**
 * Zápas – křivka vedení (PRD 4.9, podoba z 19. 11. 2026): rozdíl skóre v čase, nad nulou vede levá, pod nulou pravá.
 * Legenda jen se jmény stran (barva), body v barvě strany, která dala gól, osa +N / 0 / −N, 
 * čas po čtvrtinách (obrat se nevyznačuje, 19. 11. 2026). Daň: gól ze ztráty soupeře má červený čárkovaný schod a bod v červeném kroužku.
 */
function MatchCurve({ p, nameA, nameB, unit }: { p: MatchProgress; nameA: string; nameB: string; unit: 'gól' | 'set' }) {
  const [ref, width] = useWidth();
  const W = Math.max(220, width);
  const L = 28, R = 38, T = 10, PH = 138, B = 22;
  const H = T + PH + B;
  const pw = W - L - R, ph = PH;
  const x = (pos: number) => L + pw * pos;
  const mid = T + ph / 2;
  const max = p.maxLead;
  const y = (d: number) => mid - (d * (ph / 2)) / (max + 0.4);
  const diff = (s: [number, number]) => s[0] - s[1];
  const d0 = diff(p.initial);
  const goals = p.steps.filter((s) => s.kind === 'goal');
  // Ztráta bez gólu soupeře hned po ní (starší data): jen značka na spodní ose.
  const loose = p.steps.filter((s, i) => s.kind === 'loss' && !p.steps[i + 1]?.fromLoss);
  // Plocha bez přerušení; čára přeruší schody gólů ze ztráty, ty se kreslí zvlášť červeně čárkovaně.
  let prevD = d0;
  let line = `M${x(0)},${y(d0)}`;
  let area = `M${x(0)},${mid} V${y(d0)}`;
  const tax: { x: number; y1: number; y2: number }[] = [];
  for (const g of goals) {
    const gx = x(g.pos).toFixed(1), gy = y(diff(g.score)).toFixed(1);
    area += ` H${gx} V${gy}`;
    if (g.fromLoss) {
      line += ` H${gx} M${gx},${gy}`;
      tax.push({ x: x(g.pos), y1: y(prevD), y2: y(diff(g.score)) });
    } else line += ` H${gx} V${gy}`;
    prevD = diff(g.score);
  }
  line += ` H${x(1)}`;
  area += ` H${x(1)} V${mid} Z`;
  const id = `tl${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const total = p.end - p.start;
  // Osa času po čtvrtinách celku (19. 11. 2026): 0, 25 %, 50 %, 75 %, konec.
  const quarters = [0, 0.25, 0.5, 0.75, 1];
  const nameOf = (s: 'A' | 'B') => (s === 'A' ? nameA : nameB);
  const what = unit === 'gól' ? 'Gól' : 'Set';
  return (
    <div ref={ref} className="tl-curve">
      <div className="tl-legend">
        <span>
          <i className="tl-dot side-a" />
          {nameA}
        </span>
        <span>
          <i className="tl-dot side-b" />
          {nameB}
        </span>
      </div>
      <svg width={W} height={H} role="img" aria-label={`Křivka vedení, konečný stav ${p.score.join(':')}`}>
        <defs>
          <clipPath id={`${id}u`}>
            <rect x={0} y={0} width={W} height={mid} />
          </clipPath>
          <clipPath id={`${id}d`}>
            <rect x={0} y={mid} width={W} height={H - mid} />
          </clipPath>
        </defs>
        {[max, 0, -max].map((v) => (
          <text key={v} className="tl-time" textAnchor="end" x={L - 6} y={y(v) + 3}>
            {v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0'}
          </text>
        ))}
        <path className="tl-area-a" d={area} clipPath={`url(#${id}u)`} />
        <path className="tl-area-b" d={area} clipPath={`url(#${id}d)`} />
        <line className="tl-axis-line" x1={L} x2={L + pw} y1={mid} y2={mid} />
        <path className="tl-step" d={line} />
        {tax.map((s, i) => (
          <line key={i} className="tl-tax-step" x1={s.x} x2={s.x} y1={s.y1} y2={s.y2} />
        ))}
        {goals.map((g, i) => {
          const cx = x(g.pos), cy = y(diff(g.score));
          const who = `${nameOf(g.side)} v ${fmtDur(g.at - p.start)} → ${g.score.join(':')}`;
          return (
            <g key={i}>
              {g.fromLoss && <circle className="tl-tax-ring" cx={cx} cy={cy} r={8.5} />}
              <circle className={`tl-pt ${sideCls(g.side)}`} cx={cx} cy={cy} r={5}>
                <title>{g.fromLoss ? `${what} ze ztráty soupeře: ${who}` : `${what}: ${who}`}</title>
              </circle>
            </g>
          );
        })}
        <text className="tl-end-lbl" x={x(1) + 5} y={y(diff(p.score)) + 5}>
          {p.score.join(':')}
        </text>
        {loose.map((l, i) => (
          <circle key={i} className="tl-loss-pt" cx={x(l.pos)} cy={T + ph + 5} r={3.5}>
            <title>{`Ztráta: ${nameOf(l.side)} v ${fmtDur(l.at - p.start)}`}</title>
          </circle>
        ))}
        {quarters.map((q) => (
          <g key={q}>
            <line className="tl-tick" x1={x(q)} x2={x(q)} y1={H - 14} y2={H - 10} />
            <text className="tl-time" textAnchor={q === 0 ? 'start' : q === 1 ? 'end' : 'middle'} x={x(q)} y={H - 1}>
              {fmtDur(total * q)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Zápas (PRD 4.9): křivka vedení (od 18. 11. 2026 jediné zobrazení, Sloupec zrušen). U starší simulace jsou „góly“ sety. */
export function MatchTimeline({ match: m, events, from, to, names }: { match: Match; events: GameEvent[]; from: number; to: number; names: Record<PlayerId, string> }) {
  const nm = (ids: PlayerId[]) => ids.map((id) => names[id] ?? '?').join(' + ');
  const sim = setScores(m);
  // Ztráty jen u Daně za ztrátu (18. 11. 2026); starší ťuknuté ztráty jinde se nezobrazují.
  const p = matchProgress(m.trackLosses ? events : events.filter((e) => e.kind !== 'loss'), from, to, sim ? [0, 0] : (m.start ?? [0, 0]));
  const props = { p, nameA: nm(m.sideA), nameB: nm(m.sideB), unit: sim ? ('set' as const) : ('gól' as const) };
  return <MatchCurve {...props} />;
}

const drillSummary = (r: DrillRow) =>
  `${r.marks.filter(Boolean).length}/${r.marks.length}` +
  (r.streak && r.streak.length > 1 ? ` · nejdelší série ${r.streak.length}` : '') +
  (r.marks.length >= 4 ? ` · 1. půlka ${r.halves[0]}, 2. půlka ${r.halves[1]}` : '');

/** Barva hráče v cvičení: 1. zlatá, 2. tmavá, další černá (čárkovaně v křivce). */
const playerCls = (i: number) => `pl-${Math.min(i, 2)}`;

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
        {/* Pokusy po čtvrtinách celku (19. 11. 2026): např. 5 · 10 · 15 · 20. */}
        {[...new Set([0.25, 0.5, 0.75, 1].map((q) => Math.max(1, Math.round(n * q))))].map((a) => (
          <text key={a} className="tl-time" textAnchor={a === n ? 'end' : 'middle'} x={x(a)} y={H - 6}>
            {a}
          </text>
        ))}
        <text className="tl-time" textAnchor="start" x={x(0)} y={H - 6}>
          pokus
        </text>
      </svg>
    </div>
  );
}

/** Cvičení (PRD 4.9): křivky povedených pokusů (jediné zobrazení od 18. 11. 2026), pod tím souhrn každého hráče. */
export function DrillTimeline({ players, events, names }: { players: PlayerId[]; events: GameEvent[]; names: Record<PlayerId, string> }) {
  const all = drillTimeline(events, players);
  const rows = players.map((p, i) => ({ p, r: all[p], i })).filter((x) => x.r.marks.length > 0);
  if (!rows.length) return null;
  return (
    <>
      <DrillCurve rows={rows} names={names} />
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

/**
 * „Průběh“ – jen když má hra ťukané události. V Moje hry vždy rozbalený bez sbalení (18. 11. 2026),
 * jinde rozbalitelný.
 */
export function TimelineBox({ count, children, open }: { count: number; children: ReactNode; open?: boolean }) {
  if (!count) return null;
  if (open)
    return (
      <section className="tl-box" role="group" aria-label="Průběh">
        <h4 className="tl-h">Průběh</h4>
        {children}
      </section>
    );
  return (
    <details className="tl-box" open={open} role="group" aria-label="Průběh">
      <summary>Průběh</summary>
      {children}
    </details>
  );
}
