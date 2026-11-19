import { playerHistory } from '../../domain/ladder';
import { SOLO_METRICS } from '../../domain/solo';
import { streakTime } from '../../domain/streak';
import type { UiPrefs } from '../../storage/prefs';
import { rangeText } from '../components/RangeLabel';
import { formatDate, todayIso } from '../dates';
import { dec1, diffCls, MODE_LABEL, signed, STRONG_PER_TRAINING } from '../format';
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
                {/* Rozdíl a vyhrané / prohrané legy jako v souhrnu tréninku (19. 11. 2026). */}
                <th className="n" title="Rozdíl skóre (G+ − G−)">G±</th>
                <th className="n" title="Vyhrané legy">L+</th>
                <th className="n" title="Prohrané legy">L−</th>
                <th className="n" title="Ztráty na leg">Ztráty</th>
                <th className="n" title="Simulace: výhry / zápasy">Sim.</th>
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
                  <td className={diffCls(r.diff, r.diff >= STRONG_PER_TRAINING)}>{signed(r.diff)}</td>
                  <td className="n">{r.wins}</td>
                  <td className="n">{r.legs - r.wins}</td>
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
