import { playerHistory, resolveRange } from '../../domain/ladder';
import { DISCIPLINES } from '../../domain/disciplines';
import { playerDrillHistory, playerMatchHistory, type PlayerMatch } from '../../domain/playerDetail';
import { SOLO_METRICS, soloMetric } from '../../domain/solo';
import { streakTime } from '../../domain/streak';
import type { DisciplineId, PlayerId, SoloMetric } from '../../domain/types';
import type { UiPrefs } from '../../storage/prefs';
import { rangeText } from '../components/RangeLabel';
import { formatDate, todayIso } from '../dates';
import { dec1, diffCls, matchTableName, MODE_LABEL, signed, STRONG_PER_TRAINING } from '../format';
import type { AppStore } from '../useAppState';
import type { PlayerFocus, Route } from '../useHashRoute';
import { useMobile } from '../useMobile';

interface Props {
  store: AppStore;
  id: string;
  /** Klik na jméno v tabulce disciplíny / cvičení: jen její výsledky po trénincích (20. 11. 2026). */
  focus?: PlayerFocus;
  prefs: UiPrefs;
  navigate(r: Route): void;
}

export function PlayerPage({ store, id, focus, prefs, navigate }: Props) {
  const today = todayIso();
  const player = store.data.players.find((p) => p.id === id);
  const back = (
    <button type="button" className="back" onClick={() => navigate({ page: 'ladder' })}>
      Zpět na žebříčky
    </button>
  );
  const discipline = focus?.kind === 'match' && DISCIPLINES.some((d) => d.id === focus.discipline) ? (focus.discipline as DisciplineId) : null;
  const metric = focus?.kind === 'drill' && SOLO_METRICS.some((m) => m.id === focus.metric) ? (focus.metric as SoloMetric) : null;
  if (player && (discipline || metric)) {
    const names = new Map(store.data.players.map((p) => [p.id, p.name]));
    const props = { store, playerId: id, prefs, today, navigate, name: (p: PlayerId) => names.get(p) ?? '?' };
    return (
      <section>
        {back}
        <h1>{player.name}</h1>
        {discipline ? <MatchDetail {...props} discipline={discipline} /> : <DrillDetail {...props} metric={metric!} />}
        <p>
          <button type="button" className="player-link" onClick={() => navigate({ page: 'player', id })}>
            Všechny tréninky hráče ›
          </button>
        </p>
      </section>
    );
  }
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
        <p className="note">V tomhle období hráč nebyl na žádném klubovém tréninku.</p>
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

interface DetailProps {
  store: AppStore;
  playerId: PlayerId;
  prefs: UiPrefs;
  today: string;
  navigate(r: Route): void;
  name(p: PlayerId): string;
}

const placeLabel = (practice: boolean) => (practice ? 'Vlastní' : 'Klubový');

/** Datum jako odkaz na trénink (klik i klávesnice), celý řádek je klikací. */
function DateLink({ id, date, navigate }: { id: string; date: string; navigate(r: Route): void }) {
  return (
    <button type="button" className="player-link" onClick={() => navigate({ page: 'training', id })}>
      {formatDate(date)}
    </button>
  );
}

const RESULT: Record<NonNullable<PlayerMatch['result']>, string> = { win: 'výhra', loss: 'prohra', draw: 'remíza' };

/** Jeden zápas: s kým, proti komu, skóre legů ze strany hráče a výsledek. */
function MatchLine({ m, name }: { m: PlayerMatch; name(p: PlayerId): string }) {
  const who = `${m.partners.length ? `s ${m.partners.map(name).join(' + ')} ` : ''}proti ${m.opponents.map(name).join(' + ')}`;
  return (
    <span className="pm-line">
      <span className="pm-who">{who}</span>{' '}
      <span className="pm-legs">{m.legs.length ? m.legs.map((l) => `${l.gf}:${l.gc}`).join(' · ') : '–'}</span>{' '}
      <span className={m.result === 'win' ? 'pm-res pos' : m.result === 'loss' ? 'pm-res neg' : 'pm-res'}>{m.result ? RESULT[m.result] : 'nedohraný'}</span>
    </span>
  );
}

/** Výsledky hráče v jedné zápasové disciplíně po trénincích (20. 11. 2026). */
function MatchDetail({ store, playerId, prefs, today, navigate, name, discipline }: DetailProps & { discipline: DisciplineId }) {
  const mobile = useMobile();
  const r = resolveRange(prefs.ladderRange, today);
  const kind = prefs.ladderMatchKind ?? 'all';
  const rows = playerMatchHistory(store.data.trainings, playerId, discipline, r.from, r.to, kind);
  const sum = rows.reduce((a, x) => ({ wins: a.wins + x.wins, losses: a.losses + x.losses, legWins: a.legWins + x.legWins, legLosses: a.legLosses + x.legLosses, gf: a.gf + x.gf, gc: a.gc + x.gc }), { wins: 0, losses: 0, legWins: 0, legLosses: 0, gf: 0, gc: 0 });
  const title = matchTableName(discipline);
  return (
    <>
      <h2>{title}</h2>
      <p className="dateline">
        {rangeText(prefs.ladderRange, today)}
        {kind !== 'all' && ` · jen ${kind === 'singles' ? '1 na 1' : '2 na 2'}`}
      </p>
      {rows.length === 0 ? (
        <p className="note">V tomhle období hráč tuhle disciplínu nehrál.</p>
      ) : (
        <div className="wrap">
          <table aria-label={`${title} po trénincích`} className="player-detail">
            <thead>
              <tr>
                <th>Datum</th>
                {!mobile && <th>Trénink</th>}
                <th>Zápasy</th>
                {mobile ? (
                  <th className="n" title="Vyhrané / prohrané zápasy">Z+/Z−</th>
                ) : (
                  <>
                    <th className="n" title="Vyhrané zápasy">Z+</th>
                    <th className="n" title="Prohrané zápasy">Z−</th>
                    <th className="n" title="Vyhrané legy">L+</th>
                    <th className="n" title="Prohrané legy">L−</th>
                  </>
                )}
                <th className="n" title="Rozdíl skóre (G+ − G−)">G±</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.trainingId} className="clickable" onClick={() => navigate({ page: 'training', id: x.trainingId })}>
                  <td>
                    <DateLink id={x.trainingId} date={x.date} navigate={navigate} />
                    {mobile && <small className="pm-place">{placeLabel(x.practice)}</small>}
                  </td>
                  {!mobile && <td>{placeLabel(x.practice)}</td>}
                  <td className="pm-matches">
                    {x.matches.map((m) => (
                      <MatchLine key={m.matchId} m={m} name={name} />
                    ))}
                  </td>
                  {mobile ? (
                    <td className="n">{`${x.wins} / ${x.losses}`}</td>
                  ) : (
                    <>
                      <td className="n">{x.wins}</td>
                      <td className="n">{x.losses}</td>
                      <td className="n">{x.legWins}</td>
                      <td className="n">{x.legLosses}</td>
                    </>
                  )}
                  <td className={diffCls(x.gf - x.gc, false)}>{signed(x.gf - x.gc)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={mobile ? 2 : 3}>Celkem</th>
                {mobile ? (
                  <td className="n">{`${sum.wins} / ${sum.losses}`}</td>
                ) : (
                  <>
                    <td className="n">{sum.wins}</td>
                    <td className="n">{sum.losses}</td>
                    <td className="n">{sum.legWins}</td>
                    <td className="n">{sum.legLosses}</td>
                  </>
                )}
                <td className={diffCls(sum.gf - sum.gc, false)}>{signed(sum.gf - sum.gc)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}

/** Výsledky hráče v jednom cvičení po trénincích (20. 11. 2026). */
function DrillDetail({ store, playerId, prefs, today, navigate, metric }: DetailProps & { metric: SoloMetric }) {
  const def = soloMetric(metric);
  const r = resolveRange(prefs.ladderRange, today);
  const rows = playerDrillHistory(store.data.trainings, playerId, metric, r.from, r.to);
  const value = (v: number, possible: number) => (def.streak ? (v > 0 ? streakTime(v) : 'nesplněno') : `${v} / ${possible}`);
  return (
    <>
      <h2>{def.name}</h2>
      <p className="dateline">{rangeText(prefs.ladderRange, today)}</p>
      <p className="note">{def.streak ? `${def.what}, počítá se nejlepší čas` : `${def.what}, ${def.lowerIsBetter ? 'méně je lépe' : 'víc je lépe'}`}</p>
      {rows.length === 0 ? (
        <p className="note">V tomhle období hráč tohle cvičení nezapsal.</p>
      ) : (
        <div className="wrap">
          <table aria-label={`${def.name} po trénincích`} className="player-detail">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Trénink</th>
                <th>Série</th>
                <th className="n">{def.streak ? 'Nejlepší čas' : 'Celkem'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.trainingId} className="clickable" onClick={() => navigate({ page: 'training', id: x.trainingId })}>
                  <td>
                    <DateLink id={x.trainingId} date={x.date} navigate={navigate} />
                  </td>
                  <td>{placeLabel(x.practice)}</td>
                  <td>{x.values.map((v) => value(v.value, v.possible)).join(' · ')}</td>
                  <td className="n">{def.streak ? (x.best ? streakTime(x.best) : 'nesplněno') : `${x.sum} / ${x.possible}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
