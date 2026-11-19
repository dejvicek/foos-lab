import { Fragment } from 'react';
import { Seg } from '../components/Seg';
import { computeLadder, FORM_DAYS, MIN_TRAININGS, resolveRange, type LadderRow, type LadderView } from '../../domain/ladder';
import { computeMatchLadder, type MatchKindFilter, type PracticeMatchRow, type PracticeMatchTable as PracticeMatchTableData } from '../../domain/practice';
import { discipline } from '../../domain/disciplines';
import { addDays } from '../../domain/dates';
import type { DisciplineId, PlayerId } from '../../domain/types';
import type { LadderDrills, UiPrefs } from '../../storage/prefs';
import { computeSoloLadder, type SoloLadderRow, type SoloSource } from '../../domain/soloLadder';
import { soloMetric } from '../../domain/solo';
import { streakTime } from '../../domain/streak';
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
import { Medal, podiumRow, Progress } from '../components/Rank';
import { placeAndSort, RankTh, sortedCls, SortTh, useSort, type SortCol, type SortDir } from '../components/SortTable';

interface Props {
  store: AppStore;
  prefs: UiPrefs;
  setPrefs(p: UiPrefs): void;
  navigate(r: Route): void;
}

const dash = (v: number | null, f: (v: number) => string) => (v === null ? '–' : f(v));

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
  const [sort, setSort] = useSort();
  // Sloupce (18. 11. 2026: řazení podle libovolného sloupce); hodnoty podle Průměr / Celkem jako v buňkách.
  const cols: (SortCol<LadderRow> & { show(r: LadderRow): string })[] = [
    { key: 'name', label: 'Hráč', value: (r) => name(r.playerId), first: 'asc', show: (r) => name(r.playerId) },
    { key: 'trainings', label: 'Tréninky', className: 'n', value: (r) => r.trainings, show: (r) => String(r.trainings) },
    { key: 'legs', label: 'Legy', className: 'n', value: (r) => r.legs, show: (r) => String(r.legs) },
    { key: 'diff', label: avg ? 'Rozdíl / leg' : 'Rozdíl', className: 'n', value: (r) => (avg ? r.diffPerLeg : r.diff), show: (r) => (avg ? dec1(r.diffPerLeg, true) : signed(r.diff)) },
    { key: 'wins', label: avg ? 'Výhry %' : 'Výhry', className: 'n', value: (r) => (avg ? r.winRate : r.wins), show: (r) => (avg ? pct(r.winRate) : String(r.wins)) },
    { key: 'gf', label: avg ? 'Góly + / leg' : 'Góly +', className: 'n', value: (r) => (avg ? r.gfPerLeg : r.gf), show: (r) => (avg ? dec1(r.gfPerLeg) : String(r.gf)) },
    { key: 'gc', label: avg ? 'Góly − / leg' : 'Góly −', className: 'n', value: (r) => (avg ? r.gcPerLeg : r.gc), show: (r) => (avg ? dec1(r.gcPerLeg) : String(r.gc)) },
    { key: 'loss', label: 'Ztráty / leg', className: 'n', value: (r) => r.lossPerLeg, show: (r) => dash(r.lossPerLeg, (v) => dec1(v)) },
    {
      key: 'sim',
      label: avg ? 'Simulace %' : 'Simulace (výhry / zápasy)',
      className: 'n',
      value: (r) => (avg ? r.simRate : r.simM ? r.simW : null),
      show: (r) => (avg ? dash(r.simRate, pct) : `${r.simW} / ${r.simM}`),
    },
  ];
  const items = placeAndSort(ranked, lowData, cols, sort);
  const firstLow = items.findIndex((x) => !x.ranked);
  const shown = sort && sort.key !== 'diff' && sort.key !== 'name' ? cols.find((c) => c.key === sort.key) : undefined;
  if (mobile)
    return (
      <>
        <label className="sort-pick">
          Řadit podle{' '}
          <select
            value={sort ? `${sort.key}:${sort.dir}` : ''}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(':');
              setSort(null);
              if (key) setSort({ key, first: dir as SortDir });
            }}
          >
            <option value="">pořadí</option>
            {cols.flatMap((c) => [
              <option key={`${c.key}:${c.first ?? 'desc'}`} value={`${c.key}:${c.first ?? 'desc'}`}>
                {`${typeof c.label === 'string' ? c.label : c.key} ${(c.first ?? 'desc') === 'desc' ? '↓' : '↑'}`}
              </option>,
              <option key={`${c.key}:${(c.first ?? 'desc') === 'desc' ? 'asc' : 'desc'}`} value={`${c.key}:${(c.first ?? 'desc') === 'desc' ? 'asc' : 'desc'}`}>
                {`${typeof c.label === 'string' ? c.label : c.key} ${(c.first ?? 'desc') === 'desc' ? '↑' : '↓'}`}
              </option>,
            ])}
          </select>
        </label>
        <ol aria-label={label} className="ladder-list">
          {items.map(({ r, place, ranked: isRanked }, i) => {
            const d = avg ? r.diffPerLeg : r.diff;
            return (
              <Fragment key={r.playerId}>
                {i === firstLow && <li role="presentation" aria-hidden="true" className="cutoff" />}
                <li className={isRanked ? podiumRow(place) : 'low-data'}>
                  <span className="ll-rank">{isRanked ? <Medal place={place} /> : <Progress have={r.trainings} need={MIN_TRAININGS} />}</span>
                  <span className="ll-who">
                    <button type="button" className="player-link" onClick={() => open(r.playerId)}>
                      {name(r.playerId)}
                    </button>
                    <small>
                      {r.legs} {plural(r.legs, 'leg', 'legy', 'legů')}, {avg ? `výhry ${pct(r.winRate)}` : `${r.wins} ${plural(r.wins, 'výhra', 'výhry', 'výher')}`}
                    </small>
                  </span>
                  {shown ? (
                    <span className="ll-main">
                      {shown.show(r)}
                      <small>{typeof shown.label === 'string' ? shown.label.toLowerCase() : ''}</small>
                    </span>
                  ) : (
                    <span className={d > 0 ? 'll-main pos' : d < 0 ? 'll-main neg' : 'll-main'}>
                      {avg ? dec1(r.diffPerLeg, true) : signed(r.diff)}
                      <small>{avg ? 'rozdíl / leg' : 'rozdíl'}</small>
                    </span>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </>
    );
  return (
    <div className="wrap">
      <table aria-label={label}>
        <thead>
          <tr>
            <RankTh sort={sort} onReset={() => setSort(null)} />
            {cols.map((c) => (
              <SortTh key={c.key} col={c} sort={sort} onSort={setSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(({ r, place, ranked: isRanked }, i) => {
            const d = avg ? r.diffPerLeg : r.diff;
            return (
              <Fragment key={r.playerId}>
                {i === firstLow && <Cutoff cols={10} />}
                <tr className={isRanked ? podiumRow(place) : 'low-data'}>
                  <td className="n rank">{isRanked ? <Medal place={place} /> : <Progress have={r.trainings} need={MIN_TRAININGS} />}</td>
                  <td className={sortedCls(sort, 'name')}>
                    <button type="button" className="player-link" onClick={() => open(r.playerId)}>
                      {name(r.playerId)}
                    </button>
                  </td>
                  <td className={sortedCls(sort, 'trainings', 'n')}>{r.trainings}</td>
                  <td className={sortedCls(sort, 'legs', 'n')}>{r.legs}</td>
                  <td className={sortedCls(sort, 'diff', d > 0 ? 'n pos' : d < 0 ? 'n neg' : 'n')}>{avg ? dec1(r.diffPerLeg, true) : signed(r.diff)}</td>
                  <td className={sortedCls(sort, 'wins', 'n')}>{avg ? pct(r.winRate) : r.wins}</td>
                  <td className={sortedCls(sort, 'gf', 'n')}>{avg ? dec1(r.gfPerLeg) : r.gf}</td>
                  <td className={sortedCls(sort, 'gc', 'n')}>{avg ? dec1(r.gcPerLeg) : r.gc}</td>
                  <td className={sortedCls(sort, 'loss', 'n')}>{dash(r.lossPerLeg, (v) => dec1(v))}</td>
                  <td className={sortedCls(sort, 'sim', 'n')}>{avg ? dash(r.simRate, pct) : `${r.simW} / ${r.simM}`}</td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cutoff({ cols }: { cols: number }) {
  return (
    <tr className="cutoff" aria-hidden="true">
      <td colSpan={cols} />
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
  attempts = false,
  streak = false,
}: {
  ranked: SoloLadderRow[];
  lowData: SoloLadderRow[];
  view: LadderView;
  label: string;
  max: number;
  name(id: PlayerId): string;
  open(id: PlayerId): void;
  /** Sloupec Pokusy (Cvičení → Solo/Duo). */
  attempts?: boolean;
  /** Čistá desítka: splněné série a nejlepší čas místo průměru / celku. */
  streak?: boolean;
}) {
  const [sort, setSort] = useSort();
  const showAttempts = attempts && !streak;
  const cols: SortCol<SoloLadderRow>[] = [
    { key: 'name', label: 'Hráč', value: (r) => name(r.playerId), first: 'asc' },
    { key: 'trainings', label: 'Tréninky', className: 'n', value: (r) => r.trainings },
    ...(showAttempts ? [{ key: 'attempts', label: 'Pokusy', className: 'n', value: (r: SoloLadderRow) => r.sumMax }] : []),
    ...(streak ? [{ key: 'done', label: 'Splněno', className: 'n', value: (r: SoloLadderRow) => r.sum }] : []),
    streak
      ? { key: 'best', label: 'Nejlepší čas', className: 'n', value: (r) => r.best || null, first: 'asc' as const }
      : { key: 'value', label: view === 'avg' ? 'Průměr' : 'Celkem', className: 'n', value: (r) => (view === 'avg' ? r.avg : r.sum) },
  ];
  const items = placeAndSort(ranked, lowData, cols, sort);
  const firstLow = items.findIndex((x) => !x.ranked);
  return (
    <div className="wrap">
      <table aria-label={label} className="solo-table">
        <thead>
          <tr>
            <RankTh sort={sort} onReset={() => setSort(null)} />
            {cols.map((c) => (
              <SortTh key={c.key} col={c} sort={sort} onSort={setSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(({ r, place, ranked: isRanked }, i) => (
            <Fragment key={r.playerId}>
              {i === firstLow && <Cutoff cols={cols.length + 1} />}
              <tr className={isRanked ? podiumRow(place) : 'low-data'}>
                <td className="n rank">{isRanked ? <Medal place={place} /> : <Progress have={r.trainings} need={MIN_TRAININGS} />}</td>
                <td className={sortedCls(sort, 'name')}>
                  <button type="button" className="player-link" onClick={() => open(r.playerId)}>
                    {name(r.playerId)}
                  </button>
                </td>
                <td className={sortedCls(sort, 'trainings', 'n')}>{r.trainings}</td>
                {showAttempts && <td className={sortedCls(sort, 'attempts', 'n')}>{r.sumMax}</td>}
                {streak && <td className={sortedCls(sort, 'done', 'n')}>{`${r.sum} / ${r.sumMax}`}</td>}
                <td className={sortedCls(sort, streak ? 'best' : 'value', 'n')}>{streak ? (r.best ? streakTime(r.best) : '–') : view === 'avg' ? `${dec1(r.avg)} / ${max}` : `${r.sum} / ${r.sumMax}`}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Název tabulky zápasů podle disciplín: Normální leg ve čtyřhře = „2v2“ (singl jsou Jedničky), 19. 11. 2026. */
const matchTableName = (id: DisciplineId) => (id === 'normal' ? '2v2' : discipline(id).name);

/** Zápasy 1 na 1 (12. 11. 2026, od 18. 11. 2026 v části Zápasy): vyhrané zápasy, legy a rozdíl skóre. */
function PracticeMatchTable({ table, name, open }: { table: PracticeMatchTableData; name(id: PlayerId): string; open(id: PlayerId): void }) {
  const [sort, setSort] = useSort();
  const cols: SortCol<PracticeMatchRow>[] = [
    { key: 'name', label: 'Hráč', value: (r) => name(r.playerId), first: 'asc' },
    { key: 'trainings', label: 'Tréninky', className: 'n', value: (r) => r.trainings },
    // Jen výhry z odehraných zápasů; remízy (BO2 1:1) se neukazují ani nepočítají (19. 11. 2026, *rozhodnutí uživatele*).
    { key: 'matches', label: 'Zápasy', className: 'n', value: (r) => r.wins },
    { key: 'legs', label: 'Legy', className: 'n', value: (r) => r.legWins },
    { key: 'diff', label: 'Rozdíl', className: 'n', value: (r) => r.gf - r.gc },
  ];
  const items = placeAndSort(table.ranked, table.lowData, cols, sort);
  const firstLow = items.findIndex((x) => !x.ranked);
  return (
    <div className="wrap">
      <table aria-label={matchTableName(table.discipline)} className="solo-table">
        <thead>
          <tr>
            <RankTh sort={sort} onReset={() => setSort(null)} />
            {cols.map((c) => (
              <SortTh key={c.key} col={c} sort={sort} onSort={setSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(({ r, place, ranked: isRanked }, i) => (
            <Fragment key={r.playerId}>
              {i === firstLow && <Cutoff cols={6} />}
              <tr className={isRanked ? podiumRow(place) : 'low-data'}>
                <td className="n rank">{isRanked ? <Medal place={place} /> : <Progress have={r.trainings} need={MIN_TRAININGS} />}</td>
                <td className={sortedCls(sort, 'name')}>
                  <button type="button" className="player-link" onClick={() => open(r.playerId)}>
                    {name(r.playerId)}
                  </button>
                </td>
                <td className={sortedCls(sort, 'trainings', 'n')}>{r.trainings}</td>
                <td className={sortedCls(sort, 'matches', 'n')}>{`${r.wins} / ${r.matches}`}</td>
                <td className={sortedCls(sort, 'legs', 'n')}>{`${r.legWins} / ${r.legs}`}</td>
                <td className={sortedCls(sort, 'diff', r.gf - r.gc > 0 ? 'n pos' : r.gf - r.gc < 0 ? 'n neg' : 'n')}>{signed(r.gf - r.gc)}</td>
              </tr>
            </Fragment>
          ))}
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
      <DelayTable rows={rows} names={names} showTrainings open={open} rankBy={prefs.ladderView === 'avg' ? 'avg' : 'sum'} />
      <p className="note">
        Čekání = od chvíle, kdy hráč mohl hrát (volní hráči i stůl), do zahájení utkání; připisuje se všem hráčům utkání.{' '}
        {prefs.ladderView === 'avg' ? 'Řazeno podle průměrného čekání na utkání.' : 'Řazeno podle čekání celkem.'}
      </p>
    </>
  );
}

function SoloLadder({
  store,
  prefs,
  today,
  name,
  open,
  source = 'club',
}: {
  store: AppStore;
  prefs: UiPrefs;
  today: string;
  name(id: PlayerId): string;
  open(id: PlayerId): void;
  /** practice = žebříček Vlastní (PRD 5.11). */
  source?: SoloSource;
}) {
  const tables = computeSoloLadder(store.data.trainings, prefs.ladderRange, prefs.ladderView, today, source);
  if (!tables.length)
    return (
      <p className="note">
        {source === 'practice'
          ? 'V tomhle období zatím nejsou žádné výsledky solo cvičení ani Čisté desítky.'
          : 'V tomhle období zatím nejsou žádné výsledky týmových cvičení.'}
      </p>
    );
  return (
    <div className="solo-grid">
      {tables.map((t) => {
        const def = soloMetric(t.metric);
        return (
          <section key={t.metric} className="solo-block">
            <h3>{def.name}</h3>
            <p className="note">
              {def.streak ? `${def.what}, řazeno podle nejlepšího času` : `${def.what}, ${def.lowerIsBetter ? 'méně je lépe' : 'víc je lépe'}`}
            </p>
            <SoloTable ranked={t.ranked} lowData={t.lowData} view={prefs.ladderView} label={def.name} max={def.max} name={name} open={open} attempts={source === 'practice'} streak={!!def.streak} />
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

  // Cvičení: Týmové (klub + duo stejných cvičení) / Solo/Duo (jen vlastní tréninky), 18. 11. 2026.
  const drills: LadderDrills | null = prefs.ladderPart === 'solo' || prefs.ladderPart === 'practice' ? prefs.ladderPart : null;
  const resolved = resolveRange(range, today);
  // Zápasy podle disciplín: 1 na 1 / 2 na 2 / vše (19. 11. 2026, *rozhodnutí uživatele*).
  const matchKind: MatchKindFilter = prefs.ladderMatchKind ?? 'all';
  const matchTables = prefs.ladderPart === 'matches' ? computeMatchLadder(store.data.trainings, resolved.from ?? null, resolved.to ?? null, MIN_TRAININGS, matchKind) : [];

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
      <Seg<'matches' | 'drills' | 'delays'>
        label="Část"
        value={drills ? 'drills' : (prefs.ladderPart as 'matches' | 'delays')}
        onChange={(v) => setPrefs({ ...prefs, ladderPart: v === 'drills' ? (drills ?? prefs.ladderDrills ?? 'solo') : v })}
        options={[
          ['matches', 'Zápasy'],
          ['drills', 'Cvičení'],
          ['delays', 'Zdržovači'],
        ]}
      />
      {drills && (
        <Seg<LadderDrills>
          label="Cvičení"
          value={drills}
          onChange={(v) => setPrefs({ ...prefs, ladderPart: v, ladderDrills: v })}
          options={[
            ['solo', 'Týmové'],
            ['practice', 'Solo/Duo'],
          ]}
        />
      )}
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
      {prefs.ladderPart !== 'delays' && (
        <p className="ladder-rule">
          <span aria-hidden="true">
            <Progress have={MIN_TRAININGS - 1} need={MIN_TRAININGS} />
          </span>
          {prefs.ladderPart === 'practice'
            ? `Cvičení jen pro vlastní trénink (solo, Čistá desítka). Pro umístění je potřeba aspoň ${MIN_TRAININGS} tréninků se záznamem v období.`
            : prefs.ladderPart === 'solo'
              ? `Cvičení z klubových tréninků i z vlastních tréninků duo (stejné podmínky). Pro umístění je potřeba aspoň ${MIN_TRAININGS} tréninků se záznamem v období.`
              : `Pro umístění je potřeba zúčastnit se aspoň ${MIN_TRAININGS} tréninků v období (u zápasů podle disciplín tréninků s takovým zápasem).`}{' '}
          Kdo jich má méně, je pod čárou a tečky ukazují, kolik už má.
        </p>
      )}

      {prefs.ladderPart === 'delays' ? (
        <DelayLadder store={store} prefs={prefs} today={today} open={open} />
      ) : prefs.ladderPart === 'solo' ? (
        <SoloLadder store={store} prefs={prefs} today={today} name={name} open={open} />
      ) : prefs.ladderPart === 'practice' ? (
        <SoloLadder store={store} prefs={prefs} today={today} name={name} open={open} source="practice" />
      ) : (
        <>
      {ranked.length === 0 && lowData.length === 0 ? (
        !matchTables.length && <p className="note">V tomhle období zatím nejsou žádné zapsané legy.</p>
      ) : (
        <>
          <LadderTable ranked={ranked} lowData={lowData} view={view} label="Žebříček" name={name} open={open} />
          <p className="note">
            {view === 'avg'
              ? 'Průměr: pořadí dělá rozdíl skóre na leg, pak procento výher, góly na leg a úspěšnost v simulaci.'
              : 'Celkem: pořadí dělá součet rozdílu skóre, pak výhry, góly a výhry v simulaci.'}{' '}
            Počítají se jen zapsané legy ze scénářové ligy a jedniček; simulace kola zvlášť.
          </p>
        </>
      )}
      {prefs.ladderPart === 'matches' && (ranked.length > 0 || lowData.length > 0 || matchTables.length > 0 || matchKind !== 'all') && (
        <>
          <h2>Zápasy podle disciplín</h2>
          <Seg<MatchKindFilter>
            label="Typ zápasu"
            value={matchKind}
            onChange={(v) => setPrefs({ ...prefs, ladderMatchKind: v })}
            options={[
              ['all', 'Vše'],
              ['singles', '1 na 1'],
              ['doubles', '2 na 2'],
            ]}
          />
          <p className="note">
            {matchKind === 'singles'
              ? 'Singly z klubu (i simulace) a z vlastních tréninků ve dvou.'
              : matchKind === 'doubles'
                ? 'Čtyřhry z klubu (i simulace); výhra se počítá oběma hráčům dvojice.'
                : 'Singly i čtyřhry z klubu (i simulace) a zápasy z vlastních tréninků ve dvou.'}{' '}
            Normální leg v singlu jsou Jedničky, ve čtyřhře 2v2. Víc vyhraných je lépe.
          </p>
          {!matchTables.length && <p className="note">V tomhle období žádné takové zápasy nejsou.</p>}
          <div className="solo-grid">
            {matchTables.map((t) => (
              <section key={t.discipline} className="solo-block">
                <h3>{matchTableName(t.discipline)}</h3>
                <PracticeMatchTable table={t} name={name} open={open} />
              </section>
            ))}
          </div>
        </>
      )}
        </>
      )}
    </section>
  );
}
