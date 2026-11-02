import { buildSchedule, canBuildSchedule } from '../../domain/schedule';
import { clockAt } from '../../domain/solo';
import type { Training } from '../../domain/types';

/** Krok Disciplíny: jak zhruba bude vypadat plán (kola, časy, pauzy) – přepočítá se s každou změnou. */
export function PlanPreview({ training }: { training: Training }) {
  if (!canBuildSchedule(training)) return <p className="note">Náhled plánu se ukáže, až bude dost přítomných.</p>;
  const rows = buildSchedule(training).sections.flatMap((s) => s.rows);
  return (
    <section className="plan-preview">
      <h3>Náhled plánu</h3>
      <ol aria-label="Náhled plánu">
        {rows.map((r, i) => (
          <li key={i} className={r.kind === 'break' ? 'brk' : undefined}>
            <span className="pp-time">{clockAt(training.startTime, r.time)}</span>
            <span className="pp-label">{r.label}</span>
            <span className="pp-rule">{r.rule ?? ''}</span>
          </li>
        ))}
      </ol>
      <p className="note">Časy jsou orientační, pauzy jde po vytvoření přetáhnout v rozpisu.</p>
    </section>
  );
}
