import { useEffect, useState } from 'react';
import { discipline, type DisciplineDef } from '../../domain/disciplines';
import { activePlayers, alphabetical } from '../../domain/roster';
import {
  isPractice,
  nextSeriesNo,
  practiceDrills,
  practiceMetric,
  practiceMinutes,
  practiceRunning,
  practiceSeries,
  practicesFor,
  newPractice,
  seriesDrill,
  seriesVariant,
  type PracticeSeries,
} from '../../domain/practice';
import { TRAINING_ITEM } from '../../domain/queue';
import { soloKey, soloMetric } from '../../domain/solo';
import { computeSoloLadder } from '../../domain/soloLadder';
import { MIN_TRAININGS } from '../../domain/ladder';
import { drillCount } from '../../domain/drillTap';
import type { DisciplineId, PlayerId, SoloMetric, Training } from '../../domain/types';
import type { Viewer } from '../../domain/my';
import { DrillMirror } from '../components/ScoreMirror';
import { WarmupTimer } from '../components/WarmupTimer';
import { Medal, Progress } from '../components/Rank';
import { formatDateLong, todayIso } from '../dates';
import { plural } from '../format';
import type { AppStore } from '../useAppState';
import type { Route } from '../useHashRoute';

/** Co je na obrazovce běžícího vlastního tréninku: série, Rozcvička, nebo výběr cvičení; null = poslední rozdělaná série. */
type Current = { kind: 'series'; n: number; drill: DisciplineId } | { kind: 'warmup'; startedAt: number } | { kind: 'list' } | null;

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Varianty bez vlastního názvu („varianta 1“) si hráč určí sám – stačí jejich počet. */
const namedVariants = (v: readonly string[]) => !v.every((x) => /^varianta /.test(x));
/** „Varianta 1“ / „Varianta: ke zdi“. */
const variantText = (v: string) => (/^varianta /.test(v) ? `V${v.slice(1)}` : `Varianta: ${v}`);

/** Popisek cvičení v nabídce: počet pokusů, varianty, jen ve dvou. */
function drillSub(d: DisciplineDef, players: number): string {
  if (d.individual && !d.metric) return 'timer, nic se nezapisuje';
  const m = practiceMetric(d, players);
  const parts = [m ? `${soloMetric(m).max} pokusů` : ''];
  if (d.variants) parts.push(namedVariants(d.variants) ? d.variants.join(' / ') : `${d.variants.length} varianty`);
  if (d.needsPartner) parts.push('s bránícím spoluhráčem');
  return parts.filter(Boolean).join(' · ');
}

function DrillPicker({ players, disabled, onPick }: { players: number; disabled?: boolean; onPick(d: DisciplineDef): void }) {
  return (
    <ul className="training-list practice-drills" aria-label="Cvičení">
      {practiceDrills(players).map((d) => (
        <li key={d.id}>
          <button type="button" disabled={disabled} onClick={() => onPick(d)}>
            <span>{d.name}</span>
            <span className="sub">{drillSub(d, players)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const seriesName = (t: Training, s: Pick<PracticeSeries, 'metric' | 'n'>) => {
  const d = seriesDrill(s.metric);
  const v = d.variants ? ` – ${d.variants[seriesVariant(t, s.metric, s.n)]}` : '';
  return `${d.name}${v}`;
};

/** Výsledek série jednoho hráče: „7 / 10“, nedokončená „4 z 7 pokusů“. */
const resultText = (value: number, attempts: number, max: number, metric: SoloMetric) =>
  attempts < max ? `${value} z ${attempts} ${plural(attempts, 'pokusu', 'pokusů', 'pokusů')}` : `${value} / ${max}${soloMetric(metric).lowerIsBetter ? ' ztrát' : ''}`;

function SeriesList({ t, series, name, title }: { t: Training; series: PracticeSeries[]; name(id: PlayerId): string; title: string }) {
  if (!series.length) return null;
  const pair = t.attendees.length > 1;
  return (
    <section className="practice-done" aria-label={title}>
      <h2>{title}</h2>
      <ul className="training-list">
        {series.map((s) => (
          <li key={s.key} className="practice-series">
            <span>{seriesName(t, s)}</span>
            <span className="sub">
              {s.results.map((r) => `${pair ? `${name(r.playerId)} ` : ''}${resultText(r.value, r.attempts, r.max, s.metric)}`).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** PRD 5.11: Pořadí hráčů vlastního tréninku v žebříčku Vlastní za formu, pro každou metriku tréninku. */
function Ranks({ store, t, name }: { store: AppStore; t: Training; name(id: PlayerId): string }) {
  const metrics = [...new Set(practiceSeries(t).map((s) => s.metric))];
  if (!metrics.length) return null;
  const tables = computeSoloLadder(store.data.trainings, { kind: 'form' }, 'avg', todayIso(), 'practice');
  const pair = t.attendees.length > 1;
  return (
    <section aria-label="Žebříček Vlastní">
      <h2>Žebříček Vlastní · forma 28 dní</h2>
      <ul className="training-list">
        {metrics.flatMap((m) => {
          const table = tables.find((x) => x.metric === m);
          return t.attendees.map((p) => {
            const at = table?.ranked.findIndex((r) => r.playerId === p) ?? -1;
            const low = table?.lowData.find((r) => r.playerId === p);
            if (at < 0 && !low) return null;
            return (
              <li key={`${m}-${p}`} className="practice-rank">
                <span>
                  {seriesDrill(m).name}
                  {pair ? ` · ${name(p)}` : ''}
                </span>
                {at >= 0 ? (
                  <span className="practice-place">
                    <Medal place={at + 1} /> {at + 1}. místo
                  </span>
                ) : (
                  <span className="practice-place muted">
                    <Progress have={low!.trainings} need={MIN_TRAININGS} /> ještě {MIN_TRAININGS - low!.trainings}{' '}
                    {plural(MIN_TRAININGS - low!.trainings, 'trénink', 'tréninky', 'tréninků')}
                  </span>
                )}
              </li>
            );
          });
        })}
      </ul>
    </section>
  );
}

export function PracticePage({ store, id, navigate, viewer }: { store: AppStore; id: string | null; navigate(r: Route): void; viewer: Viewer }) {
  const [current, setCurrent] = useState<Current>(null);
  const [pair, setPair] = useState(false);
  const [partner, setPartner] = useState<PlayerId>('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const byId = new Map(store.data.players.map((p) => [p.id, p]));
  const name = (pid: PlayerId) => byId.get(pid)?.name ?? '?';
  const me = viewer.playerId;

  // ── Začít ──────────────────────────────────────────────
  if (id === null) {
    const mine = practicesFor(store.data.trainings, me).find((t) => practiceRunning(t, now));
    const partners = alphabetical(activePlayers(store.data.players)).filter((p) => p.id !== me);
    const start = (d: DisciplineDef) => {
      if (!me) return;
      const t = newPractice(store.newId(), todayIso(), hhmm(new Date()), me, pair ? partner : null);
      store.saveTraining(t);
      store.startItem(t.id, TRAINING_ITEM);
      setCurrent(d.metric ? { kind: 'series', n: 1, drill: d.id } : { kind: 'warmup', startedAt: Date.now() });
      navigate({ page: 'practice', id: t.id });
    };
    if (!me) return <p className="note">Vlastní trénink může začít jen hráč ze soupisky.</p>;
    return (
      <section className="practice">
        <button type="button" className="back" onClick={() => navigate({ page: 'trainings' })}>
          Trénink
        </button>
        <h1>Vlastní trénink</h1>
        <p className="dateline">Sám nebo ve dvou, kdykoli u stolu. Výsledky jdou do žebříčku Vlastní.</p>
        {mine && (
          <div className="flow-bar practice-resume" role="status">
            <span>Máš rozdělaný vlastní trénink.</span>
            <button type="button" onClick={() => navigate({ page: 'practice', id: mine.id })}>
              Pokračovat
            </button>
          </div>
        )}
        <h2>Kdo cvičí</h2>
        <div className="segmented" role="group" aria-label="Kdo cvičí">
          <button type="button" aria-pressed={!pair} onClick={() => setPair(false)}>
            Sám
          </button>
          <button type="button" aria-pressed={pair} onClick={() => setPair(true)}>
            Ve dvou
          </button>
        </div>
        {pair && (
          <div className="setup">
            <div className="field">
              <label htmlFor="practice-partner">Spoluhráč</label>
              <select id="practice-partner" value={partner} onChange={(e) => setPartner(e.target.value)}>
                <option value="">Vyber spoluhráče</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="note">Spoluhráč uvidí trénink u sebe a může zapisovat za oba.</p>
          </div>
        )}
        <h2>Vyber cvičení</h2>
        <p className="note">Klepnutím cvičení hned začne – plán ani čas se nenastavují.</p>
        <DrillPicker players={pair ? 2 : 1} disabled={pair && !partner} onPick={start} />
      </section>
    );
  }

  const t = store.data.trainings.find((x) => x.id === id);
  if (!t || !isPractice(t))
    return (
      <div className="empty-live">
        <p>
          <strong>Vlastní trénink nenalezen.</strong>
        </p>
        <p className="note">Možná ho mezitím někdo smazal.</p>
        <button type="button" onClick={() => navigate({ page: 'trainings' })}>
          Trénink
        </button>
      </div>
    );

  const players = t.attendees;
  const plays = !!me && players.includes(me);
  const canWrite = plays || viewer.isAdmin;
  const canDelete = viewer.isAdmin || (!!me && t.createdBy === me);
  const others = players.filter((p) => p !== me);
  const who = !plays ? players.map(name).join(' a ') : others.length ? `s ${others.map(name).join(', ')}` : 'sám';
  const series = practiceSeries(t);
  const running = practiceRunning(t, now);
  const remove = () => {
    if (!confirm('Smazat vlastní trénink i se všemi výsledky?')) return;
    store.deleteTraining(t.id);
    navigate({ page: 'trainings' });
  };

  // ── Souhrn ─────────────────────────────────────────────
  if (!running) {
    const min = practiceMinutes(t);
    return (
      <section className="practice">
        <button type="button" className="back" onClick={() => navigate({ page: 'trainings' })}>
          Trénink
        </button>
        <h1>Vlastní trénink</h1>
        <p className="dateline">
          {formatDateLong(t.date)}, {t.startTime} · {who}
          {min !== null ? ` · ${min} min` : ''}
        </p>
        {series.length ? (
          <>
            <SeriesList t={t} series={series} name={name} title="Výsledky" />
            <Ranks store={store} t={t} name={name} />
          </>
        ) : (
          <p className="note">V tomhle vlastním tréninku se nic nezapsalo.</p>
        )}
        <div className="actions-row">
          <button type="button" onClick={() => navigate({ page: 'ladder' })}>
            Žebříček
          </button>
          {canDelete && (
            <button type="button" className="danger" onClick={remove}>
              Smazat
            </button>
          )}
        </div>
      </section>
    );
  }

  // ── Běží ───────────────────────────────────────────────
  const latest = series[series.length - 1];
  const latestOpen = !!latest && (latest.results.length < players.length || latest.results.some((r) => r.attempts < r.max));
  const shown: Current =
    current ?? (latest && latestOpen ? { kind: 'series', n: latest.n, drill: seriesDrill(latest.metric).id } : { kind: 'list' });
  const startedAt = t.playTimes?.[TRAINING_ITEM]?.startedAt;
  const runMin = startedAt !== undefined ? Math.max(0, Math.floor((now - startedAt) / 60_000)) : 0;
  const pick = (d: DisciplineDef) =>
    setCurrent(d.metric ? { kind: 'series', n: nextSeriesNo(t), drill: d.id } : { kind: 'warmup', startedAt: Date.now() });

  let body: React.ReactNode;
  if (shown.kind === 'series') {
    const d = discipline(shown.drill);
    const metric = practiceMetric(d, players.length)!;
    const def = soloMetric(metric);
    const key = soloKey(metric, shown.n);
    const values = Object.fromEntries(players.map((p) => [p, { value: t.soloResults[p]?.[key], attempts: t.soloAttempts?.[p]?.[key] }]));
    const done = players.every((p) => drillCount(values[p], def).done);
    body = (
      <>
        {d.variants && <p className="practice-variant">{variantText(d.variants[seriesVariant(t, metric, shown.n)])}</p>}
        <DrillMirror
          key={key}
          players={players}
          def={def}
          values={values}
          names={Object.fromEntries(players.map((p) => [p, name(p)]))}
          canSolo={() => canWrite}
          onTap={(p, ok, delta) => store.tapSolo(t.id, p, key, def, ok, delta, `series|${shown.n}`)}
        />
        <div className="actions-row">
          {done && (
            <button type="button" onClick={() => setCurrent({ kind: 'series', n: nextSeriesNo(t), drill: d.id })}>
              {d.variants ? `Znovu – ${d.variants[seriesVariant(t, metric, nextSeriesNo(t))]}` : 'Znovu totéž'}
            </button>
          )}
          <button type="button" className="ghost" onClick={() => setCurrent({ kind: 'list' })}>
            Jiné cvičení
          </button>
        </div>
      </>
    );
  } else if (shown.kind === 'warmup') {
    body = (
      <>
        <WarmupTimer startedAt={shown.startedAt} now={now} compact={false} />
        <div className="actions-row">
          <button type="button" className="ghost" onClick={() => setCurrent({ kind: 'list' })}>
            Jiné cvičení
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <h2>{series.length ? 'Další cvičení' : 'Vyber cvičení'}</h2>
        <DrillPicker players={players.length} disabled={!canWrite} onPick={pick} />
      </>
    );
  }

  return (
    <section className="practice">
      <button type="button" className="back" onClick={() => navigate({ page: 'trainings' })}>
        Trénink
      </button>
      <div className="training-head">
        <div>
          <h1>Vlastní trénink</h1>
          <p className="dateline">
            {who} · běží {runMin} min
          </p>
        </div>
        {canWrite && (
          <button type="button" className="ghost" onClick={() => store.endItem(t.id, TRAINING_ITEM)}>
            Ukončit
          </button>
        )}
      </div>
      {body}
      <SeriesList t={t} series={series} name={name} title="Dnes hotovo" />
      {canDelete && (
        <div className="actions-row">
          <button type="button" className="danger" onClick={remove}>
            Smazat vlastní trénink
          </button>
        </div>
      )}
    </section>
  );
}
