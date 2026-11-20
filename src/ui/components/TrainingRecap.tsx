import { trainingRecap } from '../../domain/recap';
import { soloMetric } from '../../domain/solo';
import { streakTime } from '../../domain/streak';
import type { PlayerId, Training } from '../../domain/types';
import { formatDayMonth, todayIso } from '../dates';
import { diffCls, signed } from '../format';
import { useTrainings } from '../records';
import { toHash } from '../useHashRoute';
import { MoveTag } from './Rank';

const treninky = (n: number) => (n === 1 ? 'trénink' : n >= 2 && n <= 4 ? 'tréninky' : 'tréninků');

/**
 * Karta „Tvůj trénink“ (20. 11. 2026, *rozhodnutí uživatele*): po mém posledním kole dnešní místo v souhrnu,
 * rozdíl a legy, výsledky cvičení a posun v žebříčku Zápasy (forma). Odkaz na souhrn tréninku.
 */
export function TrainingRecap({ training, playerId, trainings }: { training: Training; playerId: PlayerId; trainings?: Training[] }) {
  const all = useTrainings() ?? trainings ?? [training];
  const r = trainingRecap(all, training, playerId, todayIso());
  if (!r) return null;
  return (
    <section className="recap" aria-label="Tvůj trénink">
      <h2>
        Tvůj trénink <small>{formatDayMonth(training.date)}</small>
      </h2>
      {r.place !== null && (
        <p className="recap-main">
          <b>{r.place}. místo</b> z {r.of} · <span className={diffCls(r.diff, false)}>G± {signed(r.diff)}</span> · L+ {r.legWins} · L− {r.legLosses}
        </p>
      )}
      {r.drills.length > 0 && (
        <p className="recap-drills">
          {r.drills.map((d, i) => {
            const def = soloMetric(d.metric);
            return (
              <span key={d.key}>
                {i > 0 && ' · '}
                {def.name} <b>{def.streak ? (d.value > 0 ? streakTime(d.value) : 'nesplněno') : `${d.value} z ${d.max}`}</b>
              </span>
            );
          })}
        </p>
      )}
      <p className="recap-ladder">
        Žebříček Zápasy (forma):{' '}
        {r.missing !== undefined ? (
          <>do pořadí ti chybí {r.missing} {treninky(r.missing)}</>
        ) : r.move === 'new' ? (
          <b>nově v pořadí</b>
        ) : r.move ? (
          <>
            posun <MoveTag move={r.move} since={formatDayMonth(training.date)} />
          </>
        ) : (
          'pořadí beze změny'
        )}
      </p>
      <a className="recap-link" href={toHash({ page: 'training', id: training.id })}>
        Souhrn tréninku
      </a>
    </section>
  );
}
