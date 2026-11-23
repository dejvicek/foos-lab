import { Fragment } from 'react';
import { Seg } from '../components/Seg';
import { computeLadder, FORM_DAYS, MIN_TRAININGS, resolveRange, type LadderRow, type LadderView } from '../../domain/ladder';
import { computeMatchLadder, type MatchKindFilter, type PracticeMatchRow, type PracticeMatchTable as PracticeMatchTableData } from '../../domain/practice';
import { addDays } from '../../domain/dates';
import type { PlayerId } from '../../domain/types';
import type { LadderDrills, UiPrefs } from '../../storage/prefs';
import { computeSoloLadder, hasSoloFor, type SoloLadderRow, type SoloSource } from '../../domain/soloLadder';
import { soloMetric } from '../../domain/solo';
import { streakTime } from '../../domain/streak';
import { rangeText } from '../components/RangeLabel';
import { todayIso } from '../dates';
import { dec1, diffTone, matchTableName, pct, signed, STRONG_PER_LEG } from '../format';
import type { AppStore } from '../useAppState';
import type { PlayerFocus, Route } from '../useHashRoute';
import { computeDelayLadder } from '../../domain/queue';
import { canBuildSchedule } from '../../domain/schedule';
import { DelayTable } from '../components/Timing';
import { trainingQueue } from '../queue';
import { useMobile } from '../useMobile';
import { Avatar } from '../components/Avatar';
import { podiumRow, Progress, RankCell } from '../components/Rank';
import { placeAndSort, RankTh, shownSort, sortedCls, SortTh, useSort, type Sort, type SortCol } from '../components/SortTable';
import { before, hasScores, lastDay, rankMoves, type Move } from '../../domain/moves';
import { isClub } from '../../domain/practice';
import { formatDayMonth } from '../dates';

interface Props {
  store: AppStore;
  prefs: UiPrefs;
  setPrefs(p: UiPrefs): void;
  navigate(r: Route): void;
  /** Přihlášený hráč – jeho jméno je v žebříčcích zlatě (20. 11. 2026). */
  me: PlayerId | null;
}

const dash = (v: number | null, f: (v: number) => string) => (v === null ? '–' : f(v));

/** Moje jméno v žebříčku zlatě (20. 11. 2026). */
const linkCls = (me: PlayerId | null, id: PlayerId) => (me === id ? 'player-link me-name' : 'player-link');

/** Posun v pořadí (20. 11. 2026): hráči nad čarou a den posledního tréninku, proti kterému se počítá. */
interface MoveProps {
  moves?: Map<PlayerId, Move>;
  since: string | null;
  me: PlayerId | null;
}

/** Vyhrané / prohrané v jednom sloupci (Z+/Z−, L+/L−; 20. 11. 2026). */
const wl = (won: number, lost: number) => `${won} / ${lost}`;

const ids = (rows: { playerId: PlayerId }[]) => rows.map((r) => r.playerId);
const DESC = (key: string): Sort => ({ key, dir: 'desc' });

function LadderTable({
  ranked,
  lowData,
  view,
  label,
  name,
  open,
  moves,
  since,
  me,
}: {
  ranked: LadderRow[];
  lowData: LadderRow[];
  view: LadderView;
  label: string;
  name(id: PlayerId): string;
  open(id: PlayerId): void;
} & MoveProps) {
  const avg = view === 'avg';
  const mobile = useMobile();
  // Oficiální pořadí dělá G± (PRD 5.6) – bez ručního řazení je ten sloupec zvýrazněný (20. 11. 2026).
  const official = DESC('diff');
  const [sort, setSort] = useSort(official);
  const shown = shownSort(sort, official);
  // Sloupce (18. 11. 2026: řazení podle libovolného sloupce); hodnoty podle Průměr / Celkem jako v buňkách.
  // Krátká záhlaví (G±, G+, L−, Sim.) mají plný název v nápovědě (19. 11. 2026).
  const cols: (SortCol<LadderRow> & { show(r: LadderRow): string })[] = [
    { key: 'name', label: 'Hráč', value: (r) => name(r.playerId), first: 'asc', show: (r) => name(r.playerId) },
    { key: 'trainings', label: 'Tréninky', className: 'n', value: (r) => r.trainings, show: (r) => String(r.trainings) },
    // Celkem: místo Legů a Výher vyhrané / prohrané legy (19. 11. 2026); na telefonu v jednom sloupci L+/L− (20. 11. 2026, *rozhodnutí uživatele*).
    ...(avg ? [{ key: 'legs', label: 'Legy', className: 'n', value: (r: LadderRow) => r.legs, show: (r: LadderRow) => String(r.legs) }] : []),
    avg
      ? { key: 'wins', label: 'Výhry %', className: 'n', value: (r) => r.winRate, show: (r) => pct(r.winRate) }
      : mobile
        ? { key: 'wins', label: <span title="Vyhrané / prohrané legy">L+/L−</span>, className: 'n', value: (r) => r.wins, show: (r) => wl(r.wins, r.legs - r.wins) }
        : { key: 'wins', label: <span title="Vyhrané legy">L+</span>, className: 'n', value: (r) => r.wins, show: (r) => String(r.wins) },
    ...(avg || mobile ? [] : [{ key: 'lost', label: <span title="Prohrané legy">L−</span>, className: 'n', value: (r: LadderRow) => r.legs - r.wins, show: (r: LadderRow) => String(r.legs - r.wins), first: 'asc' as const }]),
    { key: 'gf', label: <span title={avg ? 'Góly vstřelené na leg' : 'Góly vstřelené'}>{avg ? 'G+\u00a0⌀' : 'G+'}</span>, className: 'n', value: (r) => (avg ? r.gfPerLeg : r.gf), show: (r) => (avg ? dec1(r.gfPerLeg) : String(r.gf)) },
    { key: 'gc', label: <span title={avg ? 'Góly obdržené na leg' : 'Góly obdržené'}>{avg ? 'G−\u00a0⌀' : 'G−'}</span>, className: 'n', value: (r) => (avg ? r.gcPerLeg : r.gc), show: (r) => (avg ? dec1(r.gcPerLeg) : String(r.gc)) },
    { key: 'loss', label: <span title="Ztráty na leg">{'Ztráty\u00a0⌀'}</span>, className: 'n', value: (r) => r.lossPerLeg, show: (r) => dash(r.lossPerLeg, (v) => dec1(v)) },
    {
      key: 'sim',
      label: <span title={avg ? 'Výhry v simulaci' : 'Simulace: výhry / zápasy'}>{avg ? 'Sim. %' : 'Sim.'}</span>,
      className: 'n',
      value: (r) => (avg ? r.simRate : r.simM ? r.simW : null),
      show: (r) => (avg ? dash(r.simRate, pct) : `${r.simW} / ${r.simM}`),
    },
    // Rozhodující sloupec vždy poslední, jako v ostatních žebříčcích (20. 11. 2026, *rozhodnutí uživatele*).
    // Průměr je „na leg“ – od 20. 11. 2026 to říká i záhlaví znakem ⌀ (G± ⌀, jako Čekání ⌀ u Zdržovačů), ať se neplete s G± v tréninku (*rozhodnutí uživatele*).
    { key: 'diff', label: <span title={avg ? 'Rozdíl skóre na leg' : 'Rozdíl skóre (G+ − G−)'}>{avg ? 'G±\u00a0⌀' : 'G±'}</span>, className: 'n', value: (r) => (avg ? r.diffPerLeg : r.diff), show: (r) => (avg ? dec1(r.diffPerLeg, true) : signed(r.diff)) },
  ];
  const items = placeAndSort(ranked, lowData, cols, sort);
  const firstLow = items.findIndex((x) => !x.ranked);
  // Barva ze stejného čísla, podle kterého se řadí (20. 11. 2026): v Celkem jen plus / minus, výrazný náskok jen na leg v Průměru.
  const tone = (r: LadderRow) => (avg ? diffTone(r.diffPerLeg, r.diffPerLeg >= STRONG_PER_LEG) : diffTone(r.diff, false));
  // Telefon: jen to hlavní (19. 11. 2026, *rozhodnutí uživatele*, návrh D) – G± a výhry (Průměr: Výhry %, Celkem: L+ / L−);
  // ostatní na notebooku a v detailu hráče. Řadí se klepnutím na záhlaví.
  if (mobile) {
    const keys = ['name', 'wins', 'diff'];
    const few = cols.filter((c) => keys.includes(c.key));
    const rows = placeAndSort(ranked, lowData, few, sort);
    const low = rows.findIndex((x) => !x.ranked);
    return (
      <div className="wrap">
        <table aria-label={label} className="ladder-table ladder-mobile">
          <thead>
            <tr>
              <RankTh sort={sort} onReset={() => setSort(null)} />
              {few.map((c) => (
                <SortTh key={c.key} col={c} sort={shown} onSort={setSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, place, ranked: isRanked }, i) => (
              <Fragment key={r.playerId}>
                {i === low && <Cutoff cols={few.length + 1} />}
                <tr className={isRanked ? podiumRow(place) : 'low-data'}>
                  <td className="n rank">{isRanked ? <RankCell place={place} move={moves?.get(r.playerId)} since={since} /> : <Progress have={r.trainings} need={MIN_TRAININGS} />}</td>
                  {few.map((c) =>
                    c.key === 'name' ? (
                      <td key={c.key} className={sortedCls(shown, 'name')}>
                        <button type="button" className={linkCls(me, r.playerId)} onClick={() => open(r.playerId)}>
                          <Avatar id={r.playerId} dim={!isRanked} />
                          {name(r.playerId)}
                        </button>
                      </td>
                    ) : (
                      <td key={c.key} className={sortedCls(shown, c.key, ['n', c.key === 'diff' ? `main ${tone(r)}` : ''].filter(Boolean).join(' '))}>
                        {c.show(r)}
                      </td>
                    ),
                  )}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="wrap">
      <table aria-label={label}>
        <thead>
          <tr>
            <RankTh sort={sort} onReset={() => setSort(null)} />
            {cols.map((c) => (
              <SortTh key={c.key} col={c} sort={shown} onSort={setSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(({ r, place, ranked: isRanked }, i) => {
            return (
              <Fragment key={r.playerId}>
                {i === firstLow && <Cutoff cols={cols.length + 1} />}
                <tr className={isRanked ? podiumRow(place) : 'low-data'}>
                  <td className="n rank">{isRanked ? <RankCell place={place} move={moves?.get(r.playerId)} since={since} /> : <Progress have={r.trainings} need={MIN_TRAININGS} />}</td>
                  <td className={sortedCls(shown, 'name')}>
                    <button type="button" className={linkCls(me, r.playerId)} onClick={() => open(r.playerId)}>
                      <Avatar id={r.playerId} dim={!isRanked} />
                      {name(r.playerId)}
                    </button>
                  </td>
                  <td className={sortedCls(shown, 'trainings', 'n')}>{r.trainings}</td>
                  {avg && <td className={sortedCls(shown, 'legs', 'n')}>{r.legs}</td>}
                  <td className={sortedCls(shown, 'wins', 'n')}>{avg ? pct(r.winRate) : r.wins}</td>
                  {!avg && <td className={sortedCls(shown, 'lost', 'n')}>{r.legs - r.wins}</td>}
                  <td className={sortedCls(shown, 'gf', 'n')}>{avg ? dec1(r.gfPerLeg) : r.gf}</td>
                  <td className={sortedCls(shown, 'gc', 'n')}>{avg ? dec1(r.gcPerLeg) : r.gc}</td>
                  <td className={sortedCls(shown, 'loss', 'n')}>{dash(r.lossPerLeg, (v) => dec1(v))}</td>
                  <td className={sortedCls(shown, 'sim', 'n')}>{avg ? dash(r.simRate, pct) : `${r.simW} / ${r.simM}`}</td>
                  <td className={sortedCls(shown, 'diff', ['n', tone(r)].filter(Boolean).join(' '))}>{avg ? dec1(r.diffPerLeg, true) : signed(r.diff)}</td>
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
  lowerIsBetter = false,
  moves,
  since,
  me,
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
  lowerIsBetter?: boolean;
} & MoveProps) {
  const official: Sort = streak ? { key: 'best', dir: 'asc' } : { key: 'value', dir: lowerIsBetter ? 'asc' : 'desc' };
  const [sort, setSort] = useSort(official);
  const shown = shownSort(sort, official);
  const showAttempts = attempts && !streak;
  const cols: SortCol<SoloLadderRow>[] = [
    // Sloupec Tréninky jen v hlavní tabulce Zápasů (20. 11. 2026, *rozhodnutí uživatele*); kolik jich kdo má, ukazují tečky pod čarou.
    { key: 'name', label: 'Hráč', value: (r) => name(r.playerId), first: 'asc' },
    ...(showAttempts ? [{ key: 'attempts', label: 'Pokusy', className: 'n', value: (r: SoloLadderRow) => r.sumMax }] : []),
    ...(streak ? [{ key: 'done', label: 'Splněno', className: 'n', value: (r: SoloLadderRow) => r.sum }] : []),
    streak
      ? { key: 'best', label: <span title="Nejlepší čas">Čas</span>, className: 'n', value: (r) => r.best || null, first: 'asc' as const }
      : { key: 'value', label: view === 'avg' ? 'Průměr' : 'Celkem', className: 'n', value: (r) => (view === 'avg' ? r.avg : r.sum), first: lowerIsBetter ? ('asc' as const) : undefined },
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
              <SortTh key={c.key} col={c} sort={shown} onSort={setSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(({ r, place, ranked: isRanked }, i) => (
            <Fragment key={r.playerId}>
              {i === firstLow && <Cutoff cols={cols.length + 1} />}
              <tr className={isRanked ? podiumRow(place) : 'low-data'}>
                <td className="n rank">{isRanked ? <RankCell place={place} move={moves?.get(r.playerId)} since={since} /> : <Progress have={r.trainings} need={MIN_TRAININGS} />}</td>
                <td className={sortedCls(shown, 'name')}>
                  <button type="button" className={linkCls(me, r.playerId)} onClick={() => open(r.playerId)}>
                    <Avatar id={r.playerId} dim={!isRanked} />
                    {name(r.playerId)}
                  </button>
                </td>
                {showAttempts && <td className={sortedCls(shown, 'attempts', 'n')}>{r.sumMax}</td>}
                {streak && <td className={sortedCls(shown, 'done', 'n')}>{`${r.sum} / ${r.sumMax}`}</td>}
                <td className={sortedCls(shown, streak ? 'best' : 'value', 'n')}>{streak ? (r.best ? streakTime(r.best) : '–') : view === 'avg' ? `${dec1(r.avg)} / ${max}` : `${r.sum} / ${r.sumMax}`}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}


/** Zápasy 1 na 1 (12. 11. 2026, od 18. 11. 2026 v části Zápasy): vyhrané zápasy, legy a rozdíl skóre. */
function PracticeMatchTable({
  table,
  view,
  name,
  open,
  moves,
  since,
  me,
}: { table: PracticeMatchTableData; view: LadderView; name(id: PlayerId): string; open(id: PlayerId): void } & MoveProps) {
  // Řazení jako hlavní žebříček (20. 11. 2026): G± (Průměr na leg, Celkem součet) – zvýrazněný sloupec.
  const official = DESC('diff');
  const [sort, setSort] = useSort(official);
  const shown = shownSort(sort, official);
  const avg = view === 'avg';
  const mobile = useMobile();
  const perLeg = (r: PracticeMatchRow) => (r.legs ? (r.gf - r.gc) / r.legs : 0);
  const lostMatches = (r: PracticeMatchRow) => r.matches - r.wins - r.draws;
  const cols: (SortCol<PracticeMatchRow> & { show?(r: PracticeMatchRow): string })[] = [
    { key: 'name', label: 'Hráč', value: (r) => name(r.playerId), first: 'asc' },
    // Vyhrané / prohrané zápasy a legy (20. 11. 2026, *rozhodnutí uživatele*; bez sloupce Tréninky): na notebooku Z+ · Z− · L+ · L−,
    // na telefonu sloučené Z+/Z− a L+/L−. Remízy (BO2 1:1) se neukazují ani nepočítají (19. 11. 2026).
    ...(mobile
      ? [
          { key: 'matches', label: <span title="Vyhrané / prohrané zápasy">Z+/Z−</span>, className: 'n', value: (r: PracticeMatchRow) => (avg ? r.rate : r.wins), show: (r: PracticeMatchRow) => wl(r.wins, lostMatches(r)) },
          { key: 'legs', label: <span title="Vyhrané / prohrané legy">L+/L−</span>, className: 'n', value: (r: PracticeMatchRow) => r.legWins, show: (r: PracticeMatchRow) => wl(r.legWins, r.legs - r.legWins) },
        ]
      : [
          { key: 'matches', label: <span title="Vyhrané zápasy">Z+</span>, className: 'n', value: (r: PracticeMatchRow) => (avg ? r.rate : r.wins), show: (r: PracticeMatchRow) => String(r.wins) },
          { key: 'matchesLost', label: <span title="Prohrané zápasy">Z−</span>, className: 'n', value: (r: PracticeMatchRow) => lostMatches(r), show: (r: PracticeMatchRow) => String(lostMatches(r)), first: 'asc' as const },
          { key: 'legs', label: <span title="Vyhrané legy">L+</span>, className: 'n', value: (r: PracticeMatchRow) => r.legWins, show: (r: PracticeMatchRow) => String(r.legWins) },
          { key: 'lost', label: <span title="Prohrané legy">L−</span>, className: 'n', value: (r: PracticeMatchRow) => r.legs - r.legWins, show: (r: PracticeMatchRow) => String(r.legs - r.legWins), first: 'asc' as const },
        ]),
    { key: 'diff', label: <span title={avg ? 'Rozdíl skóre na leg' : 'Rozdíl skóre (G+ − G−)'}>{avg ? 'G±\u00a0⌀' : 'G±'}</span>, className: 'n', value: (r) => (avg ? perLeg(r) : r.gf - r.gc) },
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
              <SortTh key={c.key} col={c} sort={shown} onSort={setSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(({ r, place, ranked: isRanked }, i) => (
            <Fragment key={r.playerId}>
              {i === firstLow && <Cutoff cols={cols.length + 1} />}
              <tr className={isRanked ? podiumRow(place) : 'low-data'}>
                <td className="n rank">{isRanked ? <RankCell place={place} move={moves?.get(r.playerId)} since={since} /> : <Progress have={r.trainings} need={MIN_TRAININGS} />}</td>
                <td className={sortedCls(shown, 'name')}>
                  <button type="button" className={linkCls(me, r.playerId)} onClick={() => open(r.playerId)}>
                    <Avatar id={r.playerId} dim={!isRanked} />
                    {name(r.playerId)}
                  </button>
                </td>
                {cols.slice(1, -1).map((c) => (
                  <td key={c.key} className={sortedCls(shown, c.key, 'n')}>
                    {c.show?.(r)}
                  </td>
                ))}
                <td className={sortedCls(shown, 'diff', ['n', avg ? diffTone(perLeg(r), perLeg(r) >= STRONG_PER_LEG) : diffTone(r.gf - r.gc, false)].filter(Boolean).join(' '))}>
                  {avg ? dec1(perLeg(r), true) : signed(r.gf - r.gc)}
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Zdržovači napříč tréninky (PRD 4.8): čekání od aktivního utkání do zahájení. */
function DelayLadder({ store, prefs, today, open, me }: { store: AppStore; prefs: UiPrefs; today: string; open(id: PlayerId): void; me: PlayerId | null }) {
  const names = Object.fromEntries(store.data.players.map((p) => [p.id, p.name]));
  const now = Date.now();
  const rows = computeDelayLadder(store.data.trainings, prefs.ladderRange, prefs.ladderView, today, (t) =>
    t.playTimes && canBuildSchedule(t) ? trainingQueue(t, now) : null,
  );
  if (!rows.length) return <p className="note">V tomhle období zatím nejsou změřená žádná utkání.</p>;
  return (
    <>
      {/* Pořadí od 3 tréninků jako v ostatních žebříčcích (20. 11. 2026); méně = pod čarou s tečkami, bez Brzdy. */}
      <DelayTable
        rows={rows.filter((r) => r.trainings >= MIN_TRAININGS)}
        lowData={rows.filter((r) => r.trainings < MIN_TRAININGS)}
        names={names}
        open={open}
        me={me}
        rankBy={prefs.ladderView === 'avg' ? 'avg' : 'sum'}
      />
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
  me,
}: {
  store: AppStore;
  prefs: UiPrefs;
  today: string;
  name(id: PlayerId): string;
  open(id: PlayerId, focus?: PlayerFocus): void;
  /** practice = žebříček Vlastní (PRD 5.11). */
  source?: SoloSource;
  me: PlayerId | null;
}) {
  const ts = store.data.trainings;
  const tables = computeSoloLadder(ts, prefs.ladderRange, prefs.ladderView, today, source);
  // Posun po posledním dni, kdy se do této části něco zapsalo (20. 11. 2026).
  const day = lastDay(ts, prefs.ladderRange, today, (t) => hasSoloFor(t, source));
  const prev = day ? computeSoloLadder(before(ts, day), prefs.ladderRange, prefs.ladderView, today, source) : null;
  const since = day && formatDayMonth(day);
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
            <SoloTable
              ranked={t.ranked}
              lowData={t.lowData}
              view={prefs.ladderView}
              label={def.name}
              max={def.max}
              name={name}
              open={(id) => open(id, { kind: 'drill', metric: t.metric })}
              attempts={source === 'practice'}
              streak={!!def.streak}
              lowerIsBetter={!!def.lowerIsBetter}
              moves={rankMoves(prev ? ids(prev.find((x) => x.metric === t.metric)?.ranked ?? []) : null, ids(t.ranked))}
              since={since}
              me={me}
            />
          </section>
        );
      })}
    </div>
  );
}

export function LadderPage({ store, prefs, setPrefs, navigate, me }: Props) {
  const today = todayIso();
  const { ladderRange: range, ladderView: view } = prefs;
  const ts = store.data.trainings;
  const { ranked, lowData } = computeLadder(ts, range, view, today);
  // Posun v pořadí proti stavu před posledním tréninkem (20. 11. 2026, *rozhodnutí uživatele*).
  const mainDay = prefs.ladderPart === 'matches' ? lastDay(ts, range, today, (t) => isClub(t) && hasScores(t)) : null;
  const mainMoves = rankMoves(mainDay ? ids(computeLadder(before(ts, mainDay), range, view, today).ranked) : null, ids(ranked));
  const byId = new Map(store.data.players.map((p) => [p.id, p]));
  const name = (id: PlayerId) => {
    const p = byId.get(id);
    return p ? (p.archived ? `${p.name} (archiv)` : p.name) : '?';
  };
  // Klik na jméno: z hlavní tabulky celkový přehled, z tabulky disciplíny / cvičení jen její výsledky (20. 11. 2026).
  const open = (id: PlayerId, focus?: PlayerFocus) => navigate({ page: 'player', id, ...(focus ? { focus } : {}) });

  // Cvičení: Týmové (klub + duo stejných cvičení) / Solo/Duo (jen vlastní tréninky), 18. 11. 2026.
  const drills: LadderDrills | null = prefs.ladderPart === 'solo' || prefs.ladderPart === 'practice' ? prefs.ladderPart : null;
  const resolved = resolveRange(range, today);
  // Zápasy podle disciplín: 1 na 1 / 2 na 2 / vše (19. 11. 2026, *rozhodnutí uživatele*).
  const matchKind: MatchKindFilter = prefs.ladderMatchKind ?? 'all';
  const matchLadder = (list: typeof ts) => computeMatchLadder(list, resolved.from ?? null, resolved.to ?? null, MIN_TRAININGS, matchKind, view);
  const matchTables = prefs.ladderPart === 'matches' ? matchLadder(ts) : [];
  const matchDay = prefs.ladderPart === 'matches' ? lastDay(ts, range, today, hasScores) : null;
  const prevMatchTables = matchDay ? matchLadder(before(ts, matchDay)) : null;
  const sinceDay = drills ? lastDay(ts, range, today, (t) => hasSoloFor(t, drills === 'practice' ? 'practice' : 'club')) : mainDay;

  const setRangeKind = (kind: 'form' | 'all' | 'custom') => {
    if (kind === 'custom') {
      const from = range.kind === 'custom' ? range.from : addDays(today, -(FORM_DAYS - 1));
      const to = range.kind === 'custom' ? range.to : today;
      setPrefs({ ...prefs, ladderRange: { kind, from, to } });
    } else setPrefs({ ...prefs, ladderRange: { kind } });
  };

  return (
    <section>
      <h1>Žebříčky</h1>
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
          {sinceDay && ` Šipky ▲▼ ukazují posun v pořadí po posledním tréninku (${formatDayMonth(sinceDay)}).`}
        </p>
      )}

      {prefs.ladderPart === 'delays' ? (
        <DelayLadder store={store} prefs={prefs} today={today} open={open} me={me} />
      ) : prefs.ladderPart === 'solo' ? (
        <SoloLadder store={store} prefs={prefs} today={today} name={name} open={open} me={me} />
      ) : prefs.ladderPart === 'practice' ? (
        <SoloLadder store={store} prefs={prefs} today={today} name={name} open={open} source="practice" me={me} />
      ) : (
        <>
      {ranked.length === 0 && lowData.length === 0 ? (
        !matchTables.length && <p className="note">V tomhle období zatím nejsou žádné zapsané legy.</p>
      ) : (
        <>
          <LadderTable ranked={ranked} lowData={lowData} view={view} label="Žebříček" name={name} open={open} moves={mainMoves} since={mainDay && formatDayMonth(mainDay)} me={me} />
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
              ['doubles', '2 na 2'],
              ['singles', '1 na 1'],
            ]}
          />
          <p className="note">
            {matchKind === 'singles'
              ? 'Singly z klubu (i simulace) a z vlastních tréninků ve dvou.'
              : matchKind === 'doubles'
                ? 'Čtyřhry z klubu (i simulace); výhra se počítá oběma hráčům dvojice.'
                : 'Singly i čtyřhry z klubu (i simulace) a zápasy z vlastních tréninků ve dvou.'}{' '}
            Normální leg (i Jedničky) v singlu je 1v1, ve čtyřhře 2v2. Pořadí jako nahoře: rozdíl skóre (G±), pak výhry.
          </p>
          {!matchTables.length && <p className="note">V tomhle období žádné takové zápasy nejsou.</p>}
          <div className="solo-grid">
            {matchTables.map((t) => (
              <section key={t.discipline} className="solo-block">
                <h3>{matchTableName(t.discipline)}</h3>
                <PracticeMatchTable
                  table={t}
                  view={view}
                  name={name}
                  open={(id) => open(id, { kind: 'match', discipline: t.discipline })}
                  moves={rankMoves(prevMatchTables ? ids(prevMatchTables.find((x) => x.discipline === t.discipline)?.ranked ?? []) : null, ids(t.ranked))}
                  since={matchDay && formatDayMonth(matchDay)}
                  me={me}
                />
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
