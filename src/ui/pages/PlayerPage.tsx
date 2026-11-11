import { playerHistory } from '../../domain/ladder';
import { SOLO_METRICS } from '../../domain/solo';
import { streakTime } from '../../domain/streak';
import type { UiPrefs } from '../../storage/prefs';
import { rangeText } from '../components/RangeLabel';
import { formatDate, todayIso } from '../dates';
import { dec1, MODE_LABEL, signed } from '../format';
import type { AppStore } from '../useAppState';
import type { Route } from '../useHashRoute';

export function PlayerPage({ store, id, prefs, navigate }: { store: AppStore; id: string; prefs: UiPrefs; navigate(r: Route): void }) {
  const today = todayIso();
  const player = store.data.players.find((p) => p.id === id);
  const back = (
    <button type="button" className="back" onClick={() => navigate({ page: 'ladder' })}>
      Zpět na žebříček
    </button>
  );
  if (!player)
    return (
      <section>
        {back}
        <p>Hráč nenalezen.</p>
      </section>
    );
  const rows = playerHistory(store.data.trainings, id, prefs.ladderRange, today);
  const metrics = SOLO_METRICS.filter((m) => rows.some((r) => r.solo[m.id] !== undefined));
  return (
    <section>
      {back}
      <h1>{player.name}</h1>
      <p className="dateline">{rangeText(prefs.ladderRange, today)}</p>
      {rows.length === 0 ? (
        <p className="note">V tomhle období hráč nebyl na žádném tréninku.</p>
      ) : (
        <div className="wrap">
          <table aria-label="Tréninky hráče">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Trénink</th>
                <th className="n">Legy</th>
                <th className="n">Výhry</th>
                <th className="n">Rozdíl</th>
                <th className="n">Ztráty / leg</th>
                <th className="n">Simulace</th>
                {metrics.map((m) => (
                  <th key={m.id} className="n" title={m.what}>
                    {m.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.trainingId} className="clickable" onClick={() => navigate({ page: 'training', id: r.trainingId })}>
                  <td>{formatDate(r.date)}</td>
                  <td>{MODE_LABEL[r.mode]}</td>
                  <td className="n">{r.legs}</td>
                  <td className="n">{r.wins}</td>
                  <td className={r.diff > 0 ? 'n pos' : r.diff < 0 ? 'n neg' : 'n'}>{signed(r.diff)}</td>
                  <td className="n">{r.lossPerLeg === null ? '–' : dec1(r.lossPerLeg)}</td>
                  <td className="n">{r.simM ? `${r.simW} / ${r.simM}` : '–'}</td>
                  {metrics.map((m) => (
                    <td key={m.id} className="n">
                      {r.solo[m.id] === undefined ? '–' : m.streak ? (r.solo[m.id]! > 0 ? streakTime(r.solo[m.id]!) : 'nesplněno') : `${r.solo[m.id]} / ${m.max}`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
