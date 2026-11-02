import { useState } from 'react';
import type { ExplanationItem } from '../../domain/content';
import { explanationsFor } from '../../domain/explain';
import { parseScoreValue } from '../../domain/standings';
import { soloKey, soloMetric, type SoloMetricDef } from '../../domain/solo';
import { drillCount } from '../../domain/drillTap';
import type { Match, MatchId, PlayerId, ScheduleRow, Score, SoloKey, Training } from '../../domain/types';
import { ScorePicker } from './ScorePicker';
import { DrillMirror, ScoreMirror } from './ScoreMirror';
import { TimingBar, type ItemTiming } from './Timing';
import { drillItemId } from '../../domain/queue';
import { isEmptyScore } from '../../domain/training';

/** Zápis ťukáním (telefon, Můj stůl) místo číselných políček. */
export interface TapEntry {
  me: PlayerId | null;
  onBumpScore(m: Match, field: keyof Score, delta: number): void;
  onBumpSolo(playerId: PlayerId, key: SoloKey, delta: number, max: number): void;
  onTapSolo?: TapSolo;
}

/** Pokus cvičení ✓ / ✗ (delta −1 = vrácení) – PRD 5.8. */
export type TapSolo = (playerId: PlayerId, key: SoloKey, def: SoloMetricDef, ok: boolean, delta: 1 | -1) => void;

/** Notebook: řádek hráče ve cvičení – číslo (zpětně z papíru) i ✓ / ✗ po pokusech. */
function DrillRows({ label, players, def, skey, training, names, canP, onSolo, onTapSolo }: {
  label: string;
  players: PlayerId[];
  def: SoloMetricDef;
  skey: SoloKey;
  training: Training;
  names: Record<PlayerId, string>;
  canP(p: PlayerId): boolean;
  onSolo(playerId: PlayerId, key: SoloKey, value: number | null): void;
  onTapSolo?: TapSolo;
}) {
  const [undo, setUndo] = useState<{ p: PlayerId; ok: boolean }[]>([]);
  return (
    <>
      {players.map((p) => {
        const v = training.soloResults[p]?.[skey];
        const c = drillCount({ value: v, attempts: training.soloAttempts?.[p]?.[skey] }, def);
        const nm = names[p] ?? '?';
        const tap = (ok: boolean) => {
          onTapSolo?.(p, skey, def, ok, 1);
          setUndo((u) => [...u, { p, ok }]);
        };
        const last = [...undo].reverse().find((x) => x.p === p);
        return (
          <div key={p} className="solo-line drill-line">
            <span>{nm}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={def.max}
              placeholder="–"
              aria-label={`${label}: ${nm}`}
              disabled={!canP(p)}
              value={v === undefined ? '' : String(v)}
              onChange={(e) => {
                const n = parseScoreValue(e.target.value);
                if (n !== null && n > def.max) return;
                onSolo(p, skey, n);
              }}
            />
            {onTapSolo && (
              <>
                <span className={c.done ? 'drill-progress done' : 'drill-progress'}>
                  {c.done ? `Hotovo ${c.value} z ${def.max}` : v === undefined ? `pokus 0 / ${def.max}` : `${c.value} (pokus ${c.attempts} / ${def.max})`}
                </span>
                {!c.done && (
                  <>
                    <button type="button" className="chip-btn ok" aria-label={`${def.ok}: ${nm}`} disabled={!canP(p)} onClick={() => tap(true)}>
                      ✓
                    </button>
                    <button type="button" className="chip-btn fail" aria-label={`${def.fail}: ${nm}`} disabled={!canP(p)} onClick={() => tap(false)}>
                      ✗
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="chip-btn"
                  aria-label={`Zpět: ${nm}`}
                  disabled={!last || !canP(p)}
                  onClick={() => {
                    if (!last) return;
                    onTapSolo(p, skey, def, last.ok, -1);
                    setUndo((u) => {
                      const i = u.lastIndexOf(last);
                      return u.filter((_, j) => j !== i);
                    });
                  }}
                >
                  ↶
                </button>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

interface Props {
  row: ScheduleRow;
  waitingLabel: string;
  training: Training;
  names: Record<PlayerId, string>;
  onScore(id: MatchId, s: Score): void;
  onSolo(playerId: PlayerId, key: SoloKey, value: number | null): void;
  /** Smí přihlášený zapisovat do zápasu / za hráče ve skupině? (výchozí ano) */
  canMatch?(m: Match): boolean;
  canSolo?(group: PlayerId[], playerId: PlayerId): boolean;
  tap?: TapEntry;
  /** Pokusy cvičení ✓ / ✗ (notebook i telefon). */
  onTapSolo?: TapSolo;
  /** Zdržovači: Zahájit / Ukončit u každého stolu; skóre jde zadat až po zahájení. */
  timing?: ItemTiming;
}

/** Jedna nápověda – stejný formát pro všechny bloky (nadpis + odstavce se štítky). */
function HelpItem({ title, item }: { title: string; item: ExplanationItem }) {
  return (
    <section className="help-item">
      <h4>{title}</h4>
      {item.parts.map((p, i) => (
        <p key={i}>
          {p.label && <span className="k">{p.label}</span>} {p.text}
        </p>
      ))}
    </section>
  );
}

export function BlockEntry({ row, waitingLabel, training, names, onScore, onSolo, canMatch = () => true, canSolo = () => true, tap, timing, onTapSolo }: Props) {
  /** Stopky stolu + jestli už jde zapisovat (zahájeno, nebo výsledek už je – oprava). */
  const timer = (id: string, players: PlayerId[], hasResult: boolean, m?: Match) => {
    const st = timing?.state(id);
    const open = !timing || !st || st.startedAt !== undefined || hasResult;
    const bar = timing && st && (
      <TimingBar
        state={st}
        now={timing.now}
        canWrite={timing.canWrite(id, players, m)}
        startAny={timing.startAny}
        onStart={() => timing.start(id)}
        onEnd={() => timing.end(id)}
      />
    );
    return { open, bar };
  };
  const nm = (ids: PlayerId[]) => ids.map((id) => names[id] ?? '?').join(' + ');
  const ex = explanationsFor(row);
  // Rozhodčí u stolu se ukazuje v kartě; pod kartami jen ti, kdo nejsou u žádného stolu.
  const refs = new Set(row.cells.flatMap((c) => (c?.type === 'match' && c.match.referee ? [c.match.referee] : [])));
  const unassigned = row.waiting.filter((p) => !refs.has(p));
  const hasHelp = ex.main.length > 0 || ex.general.length > 0 || ex.perTable.some(Boolean);
  const helpTitle = ex.perTable.some(Boolean)
    ? 'Nápověda ke stanovištím'
    : `Nápověda: ${[...ex.main.map((i) => i.name), ...ex.general.map((i) => i.name.toLocaleLowerCase('cs'))].join(', ')}`;
  const scenario = /^Start /.test(row.rule ?? '');
  return (
    <div className="block-entry">
      <div className="entry-cards">
        {row.cells.map((c, j) => {
          if (!c) return null;
          const label = `${row.label}, stůl ${j + 1}`;
          if (c.type === 'match') {
            const m = c.match;
            const tmr = timer(m.id, [...m.sideA, ...m.sideB], !isEmptyScore(training.scores[m.id]), m);
            const can = canMatch(m) && tmr.open;
            return (
              <div key={j} className="entry-card" role="group" aria-label={label}>
                <div className="entry-head">
                  Stůl {j + 1}, {m.kind === 'doubles' ? 'dvojice' : 'singl'}
                  {m.block === 'sim' && ', sety'}
                </div>
                <span className="visually-hidden">
                  {nm(m.sideA)} vs {nm(m.sideB)}
                </span>
                {tmr.bar}
                {tap ? (
                  <ScoreMirror
                    key={m.id}
                    match={m}
                    score={training.scores[m.id]}
                    names={names}
                    me={tap.me}
                    disabled={!can}
                    note={canMatch(m) && !tmr.open ? 'Skóre jde zapsat po zahájení utkání.' : undefined}
                    onBump={(f, d) => tap.onBumpScore(m, f, d)}
                  />
                ) : (
                  <ScorePicker
                    label={label}
                    match={m}
                    score={training.scores[m.id]}
                    names={names}
                    disabled={!can}
                    onChange={(s) => onScore(m.id, s)}
                  />
                )}
                {m.block === 'league' && (
                  <p className="entry-ref">
                    {m.lossTax ? 'Ztráty jsou i v gólech (Daň za ztrátu). ' : ''}
                    {m.referee ? `Rozhodčí: ${names[m.referee] ?? '?'}, čárkuje ztráty` : 'Bez rozhodčího, ztráty zapisují hráči'}
                  </p>
                )}
              </div>
            );
          }
          if (!c.metric) return null;
          const def = soloMetric(c.metric);
          const gkey = soloKey(c.metric, c.soloRound);
          const gtmr = timer(drillItemId(row, j + 1, c.players), c.players, c.players.some((p) => training.soloResults[p]?.[gkey] !== undefined));
          const canP = (p: PlayerId) => canSolo(c.players, p) && gtmr.open;
          if (tap) {
            const key = gkey;
            return (
              <div key={j} className="entry-card" role="group" aria-label={label}>
                <div className="entry-head">Stůl {j + 1}</div>
                {gtmr.bar}
                <DrillMirror
                  key={key}
                  players={c.players}
                  def={def}
                  values={Object.fromEntries(c.players.map((p) => [p, { value: training.soloResults[p]?.[key], attempts: training.soloAttempts?.[p]?.[key] }]))}
                  names={names}
                  canSolo={canP}
                  onTap={(p, ok, d) => (tap.onTapSolo ?? onTapSolo)?.(p, key, def, ok, d)}
                />
              </div>
            );
          }
          return (
            <div key={j} className="entry-card" role="group" aria-label={label}>
              <div className="entry-head">Stůl {j + 1}</div>
              {gtmr.bar}
              <div className="entry-metric">
                <strong>{def.name}</strong>
                <span>{def.what}</span>
              </div>
              <DrillRows
                key={gkey}
                label={label}
                players={c.players}
                def={def}
                skey={gkey}
                training={training}
                names={names}
                canP={canP}
                onSolo={onSolo}
                onTapSolo={onTapSolo}
              />
            </div>
          );
        })}
      </div>
      <div className="entry-foot">
        {scenario && <p className="entry-warn">Zapisuje se stav na stole, startovní góly appka odečte sama.</p>}
        {unassigned.length > 0 && (
          <p className="muted">
            {refs.size ? 'Čeká' : waitingLabel}: {unassigned.map((p) => names[p] ?? '?').join(', ')}
          </p>
        )}
        {hasHelp && (
          <details className="help">
            <summary>{helpTitle}</summary>
            {ex.perTable.some(Boolean) && (
              <div className="help-grid">
                {ex.perTable.map((it, j) =>
                  it ? <HelpItem key={j} title={`Stůl ${j + 1}: ${it.name}`} item={it} /> : <div key={j} />,
                )}
              </div>
            )}
            {[...ex.main, ...ex.general].map((it) => (
              <HelpItem key={it.name} title={it.name} item={it} />
            ))}
          </details>
        )}
      </div>
    </div>
  );
}
