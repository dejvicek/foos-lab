import { Fragment } from 'react';
import { computeLadder, FORM_DAYS, MIN_TRAININGS, type LadderRow, type LadderView } from '../../domain/ladder';
import { addDays } from '../../domain/dates';
import type { PlayerId } from '../../domain/types';
import type { LadderPart, UiPrefs } from '../../storage/prefs';
import { computeSoloLadder, type SoloLadderRow } from '../../domain/soloLadder';
import { soloMetric } from '../../domain/solo';
import { rangeText } from '../components/RangeLabel';
import { todayIso } from '../dates';
import { dec1, pct, plural, signed } from '../format';
import type { AppStore } from '../useAppState';
import type { Route } from '../useHashRoute';
import { computeDelayLadder } from '../../domain/queue';
import { canBuildSchedule } from '../../domain/schedule';
import { DelayTable } from '../components/Timing';
import { trainingQueue } from '../queue';
import { useMobile } from '../useMobile';
import { cutoffText, Medal, missingText, podiumRow, Progress } from '../components/Rank';

interface Props {
  store: AppStore;
  prefs: UiPrefs;
  setPrefs(p: UiPrefs): void;
  navigate(r: Route): void;
}

const dash = (v: number | null, f: (v: number) => string) => (v === null ? '–' : f(v));

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange(v: T): void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function LadderTable({
  ranked,
  lowData,
  view,
  label,
  name,
  open,
}: {
  ranked: LadderRow[];
  lowData: LadderRow[];
  view: LadderView;
  label: string;
  name(id: PlayerId): string;
  open(id: PlayerId): void;
}) {
  const avg = view === 'avg';
  const mobile = useMobile();
  const rows = [...ranked, ...lowData];
  const cut = ranked.length;
  if (mobile)
    return (
      <ol aria-label={label} className="ladder-list">
        {rows.map((r, i) => {
          const d = avg ? r.diffPerLeg : r.diff;
          const isRanked = i < cut;
          return (
            <Fragment key={r.playerId}>
              {i === cut && (
                <li role="presentation" className="cutoff">
                  {cutoffText(MIN_TRAININGS)}
                </li>
              )}
              <li className={isRanked ? podiumRow(i + 1) : 'low-data'}>
                <span className="ll-rank">{isRanked ? <Medal place={i + 1} /> : <Progress have={r.trainings} need={MIN_TRAININGS} />}</span>
                <span className="ll-who">
                  <button type="button" className="player-link" onClick={() => open(r.playerId)}>
                    {name(r.playerId)}
                  </button>
                  <small>
                    {!isRanked && <>{missingText(r.trainings, MIN_TRAININGS)} · </>}
                    {r.legs} {plural(r.legs, 'leg', 'legy', 'legů')}, {avg ? `výhry ${pct(r.winRate)}` : `${r.wins} ${plural(r.wins, 'výhra', 'výhry', 'výher')}`}
                  </small>
                </span>
                <span className={d > 0 ? 'll-main pos' : d < 0 ? 'll-main neg' : 'll-main'}>
                  {avg ? dec1(r.diffPerLeg, true) : signed(r.diff)}
                  <small>{avg ? 'rozdíl / leg' : 'rozdíl'}</small>
                </span>
              </li>
            </Fragment>
          );
        })}
      </ol>
    );
  return (
    <div className="wrap">
      <table aria-label={label}>
        <thead>
          <tr>
            <th className="n rank">#</th>
            <th>Hráč</th>
            <th className="n">Tréninky</th>
            <th className="n">Legy</th>
            <th className="n">{avg ? 'Rozdíl / leg' : 'Rozdíl'}</th>
            <th className="n">{avg ? 'Výhry %' : 'Výhry'}</th>
            <th className="n">{avg ? 'Góly + / leg' : 'Góly +'}</th>
            <th className="n">{avg ? 'Góly − / leg' : 'Góly −'}</th>
            <th className="n">Ztráty / leg</th>
            <th className="n">{avg ? 'Simulace %' : 'Simulace (výhry / zápasy)'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const d = avg ? r.diffPerLeg : r.diff;
            const isRanked = i < cut;
            return (
              <Fragment key={r.playerId}>
                {i === cut && <Cutoff cols={10} />}
                <tr className={isRanked ? podiumRow(i + 1) : 'low-data'}>
                  <td className="n rank">{isRanked ? <Medal place={i + 1} /> : <Progress have={r.trainings} need={MIN_TRAININGS} />}</td>
                  <td>
                    <button type="button" className="player-link" onClick={() => open(r.playerId)}>
                      {name(r.playerId)}
                    </button>
                    {!isRanked && <small className="missing">{missingText(r.trainings, MIN_TRAININGS)}</small>}
                  </td>
                  <td className="n">{r.trainings}</td>
                  <td className="n">{r.legs}</td>
                  <td className={d > 0 ? 'n pos' : d < 0 ? 'n neg' : 'n'}>{avg ? dec1(r.diffPerLeg, true) : signed(r.diff)}</td>
                  <td className="n">{avg ? pct(r.winRate) : r.wins}</td>
                  <td className="n">{avg ? dec1(r.gfPerLeg) : r.gf}</td>
                  <td className="n">{avg ? dec1(r.gcPerLeg) : r.gc}</td>
                  <td className="n">{dash(r.lossPerLeg, (v) => dec1(v))}</td>
                  <td className="n">{avg ? dash(r.simRate, pct) : `${r.simW} / ${r.simM}`}</td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Čára mezi řazenými a neřazenými hráči (méně než MIN_TRAININGS tréninků). */
function Cutoff({ cols }: { cols: number }) {
  return (
    <tr className="cutoff">
      <td colSpan={cols}>{cutoffText(MIN_TRAININGS)}</td>
    </tr>
  );
}

function SoloTable({
  ranked,
  lowData,
  view,
  label,
  max,
  name,
  open,
}: {
  ranked: SoloLadderRow[];
  lowData: SoloLadderRow[];
  view: LadderView;
  label: string;
  max: number;
  name(id: PlayerId): string;
  open(id: PlayerId): void;
}) {
  const rows = [...ranked, ...lowData];
  const cut = ranked.length;
  return (
    <div className="wrap">
      <table aria-label={label} className="solo-table">
        <thead>
          <tr>
            <th className="n rank">#</th>
            <th>Hráč</th>
            <th className="n">Tréninky</th>
            <th className="n">{view === 'avg' ? 'Průměr' : 'Celkem'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isRanked = i < cut;
            return (
              <Fragment key={r.playerId}>
                {i === cut && <Cutoff cols={4} />}
                <tr className={isRanked ? podiumRow(i + 1) : 'low-data'}>
                  <td className="n rank">{isRanked ? <Medal place={i + 1} /> : <Progress have={r.trainings} need={MIN_TRAININGS} />}</td>
                  <td>
                    <button type="button" className="player-link" onClick={() => open(r.playerId)}>
                      {name(r.playerId)}
                    </button>
                    {!isRanked && <small className="missing">{missingText(r.trainings, MIN_TRAININGS)}</small>}
                  </td>
                  <td className="n">{r.trainings}</td>
                  <td className="n">{view === 'avg' ? `${dec1(r.avg)} / ${max}` : `${r.sum} / ${r.sumMax}`}</td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Zdržovači napříč tréninky (PRD 4.8): čekání od aktivního utkání do zahájení. */
function DelayLadder({ store, prefs, today, open }: { store: AppStore; prefs: UiPrefs; today: string; open(id: PlayerId): void }) {
  const names = Object.fromEntries(store.data.players.map((p) => [p.id, p.name]));
  const now = Date.now();
  const rows = computeDelayLadder(store.data.trainings, prefs.ladderRange, prefs.ladderView, today, (t) =>
    t.playTimes && canBuildSchedule(t) ? trainingQueue(t, now) : null,
  );
  if (!rows.length) return <p className="note">V tomhle období zatím nejsou změřená žádná utkání.</p>;
  return (
    <>
      <DelayTable rows={rows} names={names} showTrainings open={open} />
      <p className="note">
        Čekání = od chvíle, kdy hráč mohl hrát (volní hráči i stůl), do zahájení utkání; připisuje se všem hráčům utkání.{' '}
        {prefs.ladderView === 'avg' ? 'Řazeno podle průměrného čekání na utkání.' : 'Řazeno podle čekání celkem.'}
      </p>
    </>
  );
}

function SoloLadder({ store, prefs, today, name, open }: { store: AppStore; prefs: UiPrefs; today: string; name(id: PlayerId): string; open(id: PlayerId): void }) {
  const tables = computeSoloLadder(store.data.trainings, prefs.ladderRange, prefs.ladderView, today);
  if (!tables.length) return <p className="note">V tomhle období zatím nejsou žádné výsledky ze sólové části.</p>;
  return (
    <div className="solo-grid">
      {tables.map((t) => {
        const def = soloMetric(t.metric);
        return (
          <section key={t.metric} className="solo-block">
            <h3>{def.name}</h3>
            <p className="note">
              {def.what}, {def.lowerIsBetter ? 'méně je lépe' : 'víc je lépe'}
            </p>
            <SoloTable ranked={t.ranked} lowData={t.lowData} view={prefs.ladderView} label={def.name} max={def.max} name={name} open={open} />
          </section>
        );
      })}
    </div>
  );
}

export function LadderPage({ store, prefs, setPrefs, navigate }: Props) {
  const today = todayIso();
  const { ladderRange: range, ladderView: view } = prefs;
  const { ranked, lowData } = computeLadder(store.data.trainings, range, view, today);
  const byId = new Map(store.data.players.map((p) => [p.id, p]));
  const name = (id: PlayerId) => {
    const p = byId.get(id);
    return p ? (p.archived ? `${p.name} (archiv)` : p.name) : '?';
  };
  const open = (id: PlayerId) => navigate({ page: 'player', id });

  const setRangeKind = (kind: 'form' | 'all' | 'custom') => {
    if (kind === 'custom') {
      const from = range.kind === 'custom' ? range.from : addDays(today, -(FORM_DAYS - 1));
      const to = range.kind === 'custom' ? range.to : today;
      setPrefs({ ...prefs, ladderRange: { kind, from, to } });
    } else setPrefs({ ...prefs, ladderRange: { kind } });
  };

  return (
    <section>
      <h1>Žebříček</h1>
      <Seg<LadderPart>
        label="Část"
        value={prefs.ladderPart}
        onChange={(v) => setPrefs({ ...prefs, ladderPart: v })}
        options={[
          ['matches', 'Zápasy'],
          ['solo', 'Stanoviště'],
          ['delays', 'Zdržovači'],
        ]}
      />
      <div>
        <Seg
          label="Období"
          value={range.kind}
          onChange={setRangeKind}
          options={[
            ['form', `Forma (${FORM_DAYS} dní)`],
            ['all', 'Celkově'],
            ['custom', 'Od–do'],
          ]}
        />
        <Seg label="Zobrazení" value={view} onChange={(v) => setPrefs({ ...prefs, ladderView: v })} options={[['avg', 'Průměr'], ['total', 'Celkem']]} />
      </div>
      {range.kind === 'custom' && (
        <div className="range-dates">
          <label htmlFor="r-from">Od</label>
          <input id="r-from" type="date" value={range.from} onChange={(e) => e.target.value && setPrefs({ ...prefs, ladderRange: { ...range, from: e.target.value } })} />
          <label htmlFor="r-to">Do</label>
          <input id="r-to" type="date" value={range.to} onChange={(e) => e.target.value && setPrefs({ ...prefs, ladderRange: { ...range, to: e.target.value } })} />
        </div>
      )}
      <p className="dateline">{rangeText(range, today)}</p>

      {prefs.ladderPart === 'delays' ? (
        <DelayLadder store={store} prefs={prefs} today={today} open={open} />
      ) : prefs.ladderPart === 'solo' ? (
        <SoloLadder store={store} prefs={prefs} today={today} name={name} open={open} />
      ) : (
        <>
      {ranked.length === 0 && lowData.length === 0 ? (
        <p className="note">V tomhle období zatím nejsou žádné zapsané legy.</p>
      ) : (
        <>
          <LadderTable ranked={ranked} lowData={lowData} view={view} label="Žebříček" name={name} open={open} />
          <p className="note">
            {view === 'avg'
              ? 'Průměr: pořadí dělá rozdíl skóre na leg, pak procento výher, góly na leg a úspěšnost v simulaci.'
              : 'Celkem: pořadí dělá součet rozdílu skóre, pak výhry, góly a výhry v simulaci.'}{' '}
            Umístění má jen hráč s aspoň {MIN_TRAININGS} tréninky v období, ostatní jsou pod čárou.{' '}
            Počítají se jen zapsané legy ze scénářové ligy a jedniček; simulace kola zvlášť.
          </p>
        </>
      )}
        </>
      )}
    </section>
  );
}
