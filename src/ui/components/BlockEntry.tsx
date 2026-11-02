import type { ExplanationItem } from '../../domain/content';
import { explanationsFor } from '../../domain/explain';
import { parseScoreValue } from '../../domain/standings';
import { soloKey, soloMetric } from '../../domain/solo';
import type { Match, MatchId, PlayerId, ScheduleRow, Score, SoloKey, Training } from '../../domain/types';
import { ScorePicker } from './ScorePicker';
import { DrillMirror, ScoreMirror } from './ScoreMirror';

/** Zápis ťukáním (telefon, Můj stůl) místo číselných políček. */
export interface TapEntry {
  me: PlayerId | null;
  onBumpScore(m: Match, field: keyof Score, delta: number): void;
  onBumpSolo(playerId: PlayerId, key: SoloKey, delta: number, max: number): void;
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

export function BlockEntry({ row, waitingLabel, training, names, onScore, onSolo, canMatch = () => true, canSolo = () => true, tap }: Props) {
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
            return (
              <div key={j} className="entry-card" role="group" aria-label={label}>
                <div className="entry-head">
                  Stůl {j + 1}, {m.kind === 'doubles' ? 'dvojice' : 'singl'}
                  {m.block === 'sim' && ', sety'}
                </div>
                <span className="visually-hidden">
                  {nm(m.sideA)} vs {nm(m.sideB)}
                </span>
                {tap ? (
                  <ScoreMirror
                    key={m.id}
                    match={m}
                    score={training.scores[m.id]}
                    names={names}
                    me={tap.me}
                    disabled={!canMatch(m)}
                    onBump={(f, d) => tap.onBumpScore(m, f, d)}
                  />
                ) : (
                  <ScorePicker
                    label={label}
                    match={m}
                    score={training.scores[m.id]}
                    names={names}
                    disabled={!canMatch(m)}
                    onChange={(s) => onScore(m.id, s)}
                  />
                )}
                {m.block === 'league' && (
                  <p className="entry-ref">
                    {m.lossTax
                      ? `Ztráty jsou v gólech (Daň za ztrátu).${m.referee ? ` Rozhodčí: ${names[m.referee] ?? '?'}` : ''}`
                      : m.referee
                        ? `Rozhodčí: ${names[m.referee] ?? '?'}, čárkuje ztráty`
                        : 'Bez rozhodčího, ztráty se nezapisují'}
                  </p>
                )}
              </div>
            );
          }
          if (!c.metric) return null;
          const def = soloMetric(c.metric);
          if (tap) {
            const key = soloKey(c.metric, c.soloRound);
            return (
              <div key={j} className="entry-card" role="group" aria-label={label}>
                <div className="entry-head">Stůl {j + 1}</div>
                <DrillMirror
                  key={key}
                  players={c.players}
                  def={def}
                  values={Object.fromEntries(c.players.map((p) => [p, training.soloResults[p]?.[key]]))}
                  names={names}
                  canSolo={(p) => canSolo(c.players, p)}
                  onBump={(p, d) => tap.onBumpSolo(p, key, d, def.max)}
                />
              </div>
            );
          }
          return (
            <div key={j} className="entry-card" role="group" aria-label={label}>
              <div className="entry-head">Stůl {j + 1}</div>
              <div className="entry-metric">
                <strong>{def.name}</strong>
                <span>{def.what}</span>
              </div>
              {c.players.map((p) => {
                const key = soloKey(c.metric!, c.soloRound);
                const v = training.soloResults[p]?.[key];
                return (
                  <label key={p} className="solo-line">
                    <span>{names[p] ?? '?'}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={def.max}
                      placeholder="–"
                      aria-label={`${label}: ${names[p] ?? '?'}`}
                      disabled={!canSolo(c.players, p)}
                      value={v === undefined ? '' : String(v)}
                      onChange={(e) => {
                        const n = parseScoreValue(e.target.value);
                        if (n !== null && n > def.max) return;
                        onSolo(p, key, n);
                      }}
                    />
                  </label>
                );
              })}
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
