import { useMemo, useState } from 'react';
import { discipline } from '../../domain/disciplines';
import { fairness, fairnessAdvice } from '../../domain/fairness';
import { buildSchedule, canBuildSchedule } from '../../domain/schedule';
import type { DisciplineId, PlayerId, Training } from '../../domain/types';
import { plural } from '../format';
import type { Highlight } from './PlanPreview';

/**
 * Kontrola rozpisu v nastavení tréninku (kdo trénink zakládá / upravuje): kolikrát spolu dva hráči hráli ve dvojici,
 * kolikrát proti sobě, zápasy a kola mimo stůl, a nápověda, kolik kol přidat, aby hrál každý
 * s každým. Simulace se nepočítá (pevné týmy).
 */
export function FairnessPanel({
  training,
  names,
  onAddRounds,
  hl,
}: {
  training: Training;
  names: Record<PlayerId, string>;
  onAddRounds?(id: DisciplineId, rounds: number): void;
  /** Najetí na jméno zvýrazní hráče v náhledu plánu. */
  hl?: Highlight;
}) {
  const [open, setOpen] = useState(false);
  const players = training.attendees;
  const ok = canBuildSchedule(training);
  const f = useMemo(() => (open && ok ? fairness(buildSchedule(training), players) : null), [open, ok, training, players]);
  // Nápověda sestavuje rozpis s koly navíc – jen když je panel otevřený.
  const advice = useMemo(() => (open && ok ? fairnessAdvice(training) : null), [open, ok, training]);
  const nm = (p: PlayerId) => names[p] ?? '?';
  const hover = (p: PlayerId) =>
    hl ? { onMouseEnter: () => hl.enter(p), onMouseLeave: () => hl.leave(), onClick: () => hl.toggle(p), className: hl.lit === p ? 'hl' : undefined } : {};

  const matrix = (label: string, value: (a: PlayerId, b: PlayerId) => number, max: number) => (
    <div className="fairness-wrap">
      <table className="fairness-table" aria-label={label}>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th />
            {players.map((p) => (
              <th key={p} scope="col" {...hover(p)}>
                {nm(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((a) => (
            <tr key={a} className={hl?.lit === a ? 'hl' : undefined}>
              <th scope="row" {...hover(a)}>
                {nm(a)}
              </th>
              {players.map((b) => {
                if (a === b) return <td key={b} className="self">–</td>;
                const v = value(a, b);
                const cls = v === 0 ? 'never' : v > 1 && v === max ? 'hot' : undefined;
                return (
                  <td key={b} className={cls} title={`${nm(a)} a ${nm(b)}: ${v}×`}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  /** Řádek nápovědy: spolu / proti sobě. */
  const tip = (label: 'Spolu' | 'Proti sobě', never: number, add: number | null, what: 'spolu' | 'proti sobě') => {
    if (!advice) return null;
    const def = discipline(advice.discipline);
    if (label === 'Spolu' && !advice.doubles) return <li>Spolu: ve dvojicích se nehraje (méně než 4 hráči).</li>;
    if (add === 0) return <li>{label}: každý s každým hraje aspoň jednou.</li>;
    const pairs = `${never} ${plural(never, 'dvojice', 'dvojice', 'dvojic')} ${what} ${plural(never, 'nehraje', 'nehrají', 'nehraje')}`;
    if (add === null) return <li>{label}: {pairs} a ani s 20 koly navíc se to nepodaří – na tolik hráčů a stolů je kol málo.</li>;
    return (
      <li>
        {label}: {pairs}. Přidej {def.name} ještě {add}× (asi {add * (def.min + 1)} min).
        {onAddRounds && advice.selected && (
          <button type="button" className="ghost" onClick={() => onAddRounds(def.id, add)}>
            Přidat {add}× {def.name} ({label === 'Spolu' ? 'spolu' : 'proti'})
          </button>
        )}
        {!advice.selected && <span className="muted"> Nejdřív vyber {def.name}.</span>}
      </li>
    );
  };

  return (
    <details className="fairness" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Kontrola rozpisu: kdo s kým kolikrát</summary>
      {!ok ? (
        <p className="note">Na rozpis je potřeba víc přítomných.</p>
      ) : (
        f &&
        advice && (
          <>
            <section className="fairness-advice" aria-label="Co přidat, aby hrál každý s každým">
              <ul>
                {tip('Spolu', advice.neverWith, advice.addForWith, 'spolu')}
                {tip('Proti sobě', advice.neverAgainst, advice.addForAgainst, 'proti sobě')}
              </ul>
              <p className="note">
                Počítá se přidáním kol zápasu dvojic; párová kola (Zeď, Start 0:3, Start 4:5) hrají stejný zápas dvakrát, nové dvojice nepřinesou. Simulace se nepočítá.
              </p>
            </section>
            <div className="fairness-grid">
              {matrix('Spoluhráči: kolikrát spolu ve dvojici', f.together, f.maxTogether)}
              {matrix('Soupeři: kolikrát proti sobě', f.against, f.maxAgainst)}
              <div className="fairness-wrap">
                <table className="fairness-table" aria-label="Zápasy a mimo stůl">
                  <caption>Zápasy a mimo stůl</caption>
                  <thead>
                    <tr>
                      <th />
                      <th scope="col">Zápasy</th>
                      <th scope="col">Mimo stůl</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((a) => (
                      <tr key={a} className={hl?.lit === a ? 'hl' : undefined}>
                        <th scope="row" {...hover(a)}>
                          {nm(a)}
                        </th>
                        <td>{f.games.get(a) ?? 0}</td>
                        <td>{f.sits.get(a) ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="note">
              <span className="never-key">0</span> = nikdy, <span className="hot-key">n</span> = nejčastěji.
            </p>
          </>
        )
      )}
    </details>
  );
}
