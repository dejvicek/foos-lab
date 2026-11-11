import { useEffect, useRef, useState } from 'react';
import { DISCIPLINES, discipline, type DisciplineDef } from '../../domain/disciplines';
import { activePlayers, alphabetical } from '../../domain/roster';
import {
  canAdvance,
  currentRound,
  isPractice,
  newPractice,
  practiceDrills,
  practiceMetric,
  practiceMinutes,
  practicePlanMinutes,
  practiceRounds,
  practiceRunning,
  practiceSeries,
  practicesFor,
  roundKey,
  roundRemainingSec,
  roundsOf,
  roundTimes,
  seriesDrill,
  type PracticeRound,
  type PracticeSeries,
} from '../../domain/practice';
import { SOLO_SELECTION } from '../../domain/plan';
import { TRAINING_ITEM } from '../../domain/queue';
import { soloMetric } from '../../domain/solo';
import { computeSoloLadder } from '../../domain/soloLadder';
import { MIN_TRAININGS } from '../../domain/ladder';
import type { DisciplineId, PlayerId, SoloMetric, Training } from '../../domain/types';
import type { Viewer } from '../../domain/my';
import { loadPracticeDrills, savePracticeDrills } from '../../storage/prefs';
import { DrillMirror } from '../components/ScoreMirror';
import { WarmupTimer } from '../components/WarmupTimer';
import { hm } from '../components/DisciplinePicker';
import { Medal, Progress } from '../components/Rank';
import { formatDateLong, todayIso } from '../dates';
import { plural } from '../format';
import { vibrate } from '../vibrate';
import { useWakeLock } from '../wakeLock';
import type { AppStore } from '../useAppState';
import type { Route } from '../useHashRoute';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const mmss = (sec: number) => `${Math.floor(Math.abs(sec) / 60)}:${String(Math.abs(sec) % 60).padStart(2, '0')}`;

/** Varianty bez vlastního názvu („varianta 1“) si hráč určí sám – stačí jejich počet. */
const namedVariants = (v: readonly string[]) => !v.every((x) => /^varianta /.test(x));
/** „Varianta 1“ / „Varianta: ke zdi“. */
const variantText = (v: string) => (/^varianta /.test(v) ? `V${v.slice(1)}` : `Varianta: ${v}`);

/** Délka cvičení v plánu: „8 min“, u dvou variant „2× 4 min“. */
const lengthText = (d: DisciplineDef) => (roundsOf(d) > 1 ? `${roundsOf(d)}× ${d.min} min` : `${d.min} min`);

/** Popisek cvičení v nabídce: délka, pokusy, varianty, s bránícím. */
function drillSub(d: DisciplineDef, players: number): string {
  const m = practiceMetric(d, players);
  const parts = [lengthText(d), m ? `${soloMetric(m).max} pokusů` : 'timer, nic se nezapisuje'];
  if (d.variants) parts.push(namedVariants(d.variants) ? d.variants.join(' / ') : `${d.variants.length} varianty`);
  if (d.needsPartner) parts.push('s bránícím spoluhráčem');
  return parts.join(' · ');
}

/** Zařadí cvičení do výběru podle katalogu: před první vybrané, které je v katalogu za ním. */
function insertByCatalog(sel: DisciplineId[], id: DisciplineId): DisciplineId[] {
  const pos = (x: DisciplineId) => DISCIPLINES.findIndex((d) => d.id === x);
  const at = sel.findIndex((x) => pos(x) > pos(id));
  return at < 0 ? [...sel, id] : [...sel.slice(0, at), id, ...sel.slice(at)];
}

const roundName = (r: Pick<PracticeRound, 'drill' | 'variant'>) => `${discipline(r.drill).name}${r.variant ? ` – ${r.variant}` : ''}`;

/** Název série: podle kola plánu, starší bez plánu podle metriky. */
function seriesName(rounds: PracticeRound[], s: PracticeSeries): string {
  const r = rounds.find((x) => x.n === s.n);
  return r ? roundName(r) : seriesDrill(s.metric).name;
}

/** Výsledek série jednoho hráče: „7 / 10“, nedokončená „4 z 7 pokusů“. */
const resultText = (value: number, attempts: number, max: number, metric: SoloMetric) =>
  attempts < max ? `${value} z ${attempts} ${plural(attempts, 'pokusu', 'pokusů', 'pokusů')}` : `${value} / ${max}${soloMetric(metric).lowerIsBetter ? ' ztrát' : ''}`;

function seriesResults(t: Training, s: PracticeSeries | undefined, name: (id: PlayerId) => string): string {
  if (!s) return '';
  const pair = t.attendees.length > 1;
  return s.results.map((r) => `${pair ? `${name(r.playerId)} ` : ''}${resultText(r.value, r.attempts, r.max, s.metric)}`).join(' · ');
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

/** Plán kol s hodinami a stavem (odehráno ✓ s výsledkem / hraje se / bude). */
function PlanList({ t, now, name }: { t: Training; now: number; name(id: PlayerId): string }) {
  const series = practiceSeries(t);
  return (
    <section aria-label="Plán">
      <h2>Plán</h2>
      <ol className="practice-plan">
        {roundTimes(t, now).map(({ round: r, start, state }) => (
          <li key={r.n} className={state}>
            <span className="pp-mark" aria-hidden="true">
              {state === 'done' ? '✓' : state === 'playing' ? '●' : '○'}
            </span>
            <span className="pp-time">{hhmm(new Date(start))}</span>
            <span className="pp-name">
              {r.n}. kolo · {roundName(r)}
              <small>
                {state === 'done'
                  ? seriesResults(t, series.find((s) => s.n === r.n), name) || (r.metric ? 'nezapsáno' : 'odcvičeno')
                  : state === 'playing'
                    ? 'hraje se'
                    : `${r.min} min`}
              </small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Hrané kolo: zahájení, odpočet, zápis ✓ / ✗ (u Rozcvičky timer) a další kolo. */
function RoundView({ store, t, r, now, canWrite, name }: { store: AppStore; t: Training; r: PracticeRound; now: number; canWrite: boolean; name(id: PlayerId): string }) {
  const rounds = practiceRounds(t);
  const last = r.n === rounds.length;
  const next = rounds[r.n];
  const startedAt = t.playTimes?.[r.item]?.startedAt;
  const left = roundRemainingSec(t, r, now);
  const advance = canAdvance(t, r, now);
  // Konec času: zavibrovat jednou (Rozcvička vibruje sama po fázích).
  const timeUp = startedAt !== undefined && left <= 0;
  const buzzed = useRef<number | null>(null);
  useEffect(() => {
    if (timeUp && r.metric && buzzed.current !== r.n) {
      buzzed.current = r.n;
      vibrate([200, 100, 200]);
    }
  }, [timeUp, r.n, r.metric]);

  const goOn = () => {
    store.endItem(t.id, r.item);
    if (last) store.endItem(t.id, TRAINING_ITEM);
    else store.startItem(t.id, rounds[r.n].item);
  };
  const key = roundKey(r);
  const players = t.attendees;

  return (
    <section className="practice-round" aria-label={`${r.n}. kolo`}>
      <div className="practice-round-head">
        <div>
          <p className="pr-count">
            {r.n}. kolo z {rounds.length}
          </p>
          <h2>{discipline(r.drill).name}</h2>
          {r.variant && <p className="practice-variant">{variantText(r.variant)}</p>}
        </div>
        {startedAt !== undefined && (
          <p className={`practice-clock${timeUp ? ' over' : ''}`} role="timer" aria-label={timeUp ? 'Čas kola vypršel' : 'Zbývá'}>
            {timeUp ? `+${mmss(-left)}` : mmss(left)}
          </p>
        )}
      </div>
      {startedAt === undefined ? (
        canWrite && (
          <button type="button" className="practice-start" onClick={() => store.startItem(t.id, r.item)}>
            Zahájit {r.n}. kolo
          </button>
        )
      ) : key ? (
        <DrillMirror
          key={key}
          players={players}
          def={soloMetric(r.metric!)}
          values={Object.fromEntries(players.map((p) => [p, { value: t.soloResults[p]?.[key], attempts: t.soloAttempts?.[p]?.[key] }]))}
          names={Object.fromEntries(players.map((p) => [p, name(p)]))}
          canSolo={() => canWrite}
          onTap={(p, ok, delta) => store.tapSolo(t.id, p, key, soloMetric(r.metric!), ok, delta, r.item)}
        />
      ) : (
        <WarmupTimer startedAt={startedAt} now={now} compact={false} />
      )}
      {startedAt !== undefined && canWrite && (
        <div className="actions-row">
          <button type="button" disabled={!advance} onClick={goOn}>
            {last ? 'Dokončit trénink' : `Další kolo: ${roundName(next)}`}
          </button>
          {!advance && <span className="note">Dál až po {r.metric ? 'všech pokusech nebo po ' : ''}uplynutí času kola.</span>}
        </div>
      )}
    </section>
  );
}

export function PracticePage({ store, id, navigate, viewer }: { store: AppStore; id: string | null; navigate(r: Route): void; viewer: Viewer }) {
  const [pair, setPair] = useState(false);
  const [partner, setPartner] = useState<PlayerId>('');
  const [sel, setSel] = useState<DisciplineId[]>(() => loadPracticeDrills() ?? SOLO_SELECTION);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const t = id === null ? undefined : store.data.trainings.find((x) => x.id === id);
  const running = !!t && isPractice(t) && practiceRunning(t, now);
  useWakeLock(running);

  const byId = new Map(store.data.players.map((p) => [p.id, p]));
  const name = (pid: PlayerId) => byId.get(pid)?.name ?? '?';
  const me = viewer.playerId;

  // ── Začít: kdo cvičí a plán ────────────────────────────
  if (id === null) {
    if (!me) return <p className="note">Vlastní trénink může začít jen hráč ze soupisky.</p>;
    const mine = practicesFor(store.data.trainings, me).find((x) => practiceRunning(x, now));
    const partners = alphabetical(activePlayers(store.data.players)).filter((p) => p.id !== me);
    const offered = practiceDrills(pair ? 2 : 1);
    const chosen = sel.filter((x) => offered.some((d) => d.id === x));
    const toggle = (x: DisciplineId) => setSel(sel.includes(x) ? sel.filter((y) => y !== x) : insertByCatalog(sel, x));
    const move = (x: DisciplineId, dir: -1 | 1) => {
      const i = chosen.indexOf(x);
      const other = chosen[i + dir];
      if (!other) return;
      const a = sel.indexOf(x);
      const b = sel.indexOf(other);
      const next = [...sel];
      [next[a], next[b]] = [next[b], next[a]];
      setSel(next);
    };
    const start = () => {
      const p = newPractice(store.newId(), todayIso(), hhmm(new Date()), me, pair ? partner : null, chosen);
      savePracticeDrills(sel);
      store.saveTraining(p);
      store.startItem(p.id, TRAINING_ITEM);
      store.startItem(p.id, practiceRounds(p)[0].item);
      navigate({ page: 'practice', id: p.id });
    };
    const total = practicePlanMinutes(chosen);
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
        <div className="practice-setup">
          <div>
            <h2>Cvičení</h2>
            <ul className="training-list practice-pick" aria-label="Cvičení">
              {offered.map((d) => (
                <li key={d.id}>
                  <label>
                    <input type="checkbox" checked={chosen.includes(d.id)} onChange={() => toggle(d.id)} />
                    <span>
                      <strong>{d.name}</strong>
                      <small>{drillSub(d, pair ? 2 : 1)}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Plán</h2>
            {chosen.length ? (
              <ol className="practice-order" aria-label="Pořadí cvičení">
                {chosen.map((x, i) => {
                  const d = discipline(x);
                  return (
                    <li key={x}>
                      <span className="po-n">{i + 1}.</span>
                      <span className="po-name">
                        {d.name}
                        <small>{lengthText(d)}</small>
                      </span>
                      <button type="button" className="icon" aria-label={`Posunout ${d.name} nahoru`} disabled={i === 0} onClick={() => move(x, -1)}>
                        ↑
                      </button>
                      <button type="button" className="icon" aria-label={`Posunout ${d.name} dolů`} disabled={i === chosen.length - 1} onClick={() => move(x, 1)}>
                        ↓
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="note">Zaškrtni aspoň jedno cvičení.</p>
            )}
            <p className="practice-total" role="status" aria-label="Naplánováno">
              Naplánováno {hm(total)}
            </p>
            <button type="button" className="practice-start" disabled={!chosen.length || (pair && !partner)} onClick={start}>
              Začít vlastní trénink
            </button>
            {pair && !partner && <p className="note">Vyber spoluhráče.</p>}
          </div>
        </div>
      </section>
    );
  }

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
  const rounds = practiceRounds(t);
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
            <section aria-label="Výsledky">
              <h2>Výsledky</h2>
              <ul className="training-list">
                {series.map((s) => (
                  <li key={s.key} className="practice-series">
                    <span>{seriesName(rounds, s)}</span>
                    <span className="sub">{seriesResults(t, s, name)}</span>
                  </li>
                ))}
              </ul>
            </section>
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
  const r = currentRound(t);
  const startedAt = t.playTimes?.[TRAINING_ITEM]?.startedAt;
  const runMin = startedAt !== undefined ? Math.max(0, Math.floor((now - startedAt) / 60_000)) : 0;
  const times = roundTimes(t, now);
  const planEnd = times.length ? times[times.length - 1].end : null;
  const end = () => {
    if (r && !confirm('Ukončit vlastní trénink? Zbývající kola se už neodcvičí.')) return;
    if (r && t.playTimes?.[r.item]?.startedAt !== undefined) store.endItem(t.id, r.item);
    store.endItem(t.id, TRAINING_ITEM);
  };

  return (
    <section className="practice">
      <button type="button" className="back" onClick={() => navigate({ page: 'trainings' })}>
        Trénink
      </button>
      <div className="training-head">
        <div>
          <h1>Vlastní trénink</h1>
          <p className="dateline">
            {who} · běží {runMin} min{planEnd !== null ? ` · konec asi v ${hhmm(new Date(planEnd))}` : ''}
          </p>
        </div>
        {canWrite && (
          <button type="button" className="ghost" onClick={end}>
            Ukončit
          </button>
        )}
      </div>
      {r ? (
        <RoundView store={store} t={t} r={r} now={now} canWrite={canWrite} name={name} />
      ) : (
        <div className="flow-bar" role="status">
          <span>Plán je odcvičený.</span>
          {canWrite && (
            <button type="button" onClick={() => store.endItem(t.id, TRAINING_ITEM)}>
              Dokončit trénink
            </button>
          )}
        </div>
      )}
      {rounds.length > 0 && <PlanList t={t} now={now} name={name} />}
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
