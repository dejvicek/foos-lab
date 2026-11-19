import { useState, type ReactNode } from 'react';
import type { ExplanationItem } from '../../domain/content';
import { explanationsFor, explanationTitle } from '../../domain/explain';
import { parseScoreValue } from '../../domain/standings';
import { soloKey, soloMetric, type SoloMetricDef } from '../../domain/solo';
import { drillCount } from '../../domain/drillTap';
import { setScores, tableScore } from '../../domain/legState';
import { legIds, matchState } from '../../domain/matchFormat';
import type { Match, MatchId, PlayerId, ScheduleRow, Score, SoloKey, Training } from '../../domain/types';
import { ScorePicker } from './ScorePicker';
import { DrillMirror, ScoreMirror, StreakMirror } from './ScoreMirror';
import { streakLimitSec, trainingStreak } from '../../domain/streak';
import { ReadyLock, TimingBar, type ReadySlot, type ItemTiming } from './Timing';
import { DrillTimeline, MatchTimeline, TimelineBox } from './GameTimeline';
import { drillItemId, readyKeys } from '../../domain/queue';
import { isEmptyScore } from '../../domain/training';
import { discipline } from '../../domain/disciplines';
import { SkillTags } from './SkillTags';
import { WarmupTimer } from './WarmupTimer';
import { warmupState } from '../../domain/warmup';

/** Zápis ťukáním (telefon, Můj stůl) místo číselných políček. */
export interface TapEntry {
  me: PlayerId | null;
  onBumpScore(m: Match, field: keyof Score, delta: number): void;
  onTapSolo?: TapSolo;
}

/** Pokus cvičení ✓ / ✗ (delta −1 = vrácení) – PRD 5.8. */
export type TapSolo = (playerId: PlayerId, key: SoloKey, def: SoloMetricDef, ok: boolean, delta: 1 | -1) => void;

/** Notebook: řádek hráče ve cvičení – číslo (zpětně z papíru) i ✓ / ✗ po pokusech. */
function DrillRows({ label, players, def, skey, training, names, canP, onSolo, onTapSolo }: {
  label: string;
  players: PlayerId[];
  def: SoloMetricDef;
  skey: SoloKey;
  training: Training;
  names: Record<PlayerId, string>;
  canP(p: PlayerId): boolean;
  onSolo(playerId: PlayerId, key: SoloKey, value: number | null): void;
  onTapSolo?: TapSolo;
}) {
  const [undo, setUndo] = useState<{ p: PlayerId; ok: boolean }[]>([]);
  return (
    <>
      {players.map((p) => {
        const v = training.soloResults[p]?.[skey];
        const c = drillCount({ value: v, attempts: training.soloAttempts?.[p]?.[skey] }, def);
        const nm = names[p] ?? '?';
        const tap = (ok: boolean) => {
          onTapSolo?.(p, skey, def, ok, 1);
          setUndo((u) => [...u, { p, ok }]);
        };
        const last = [...undo].reverse().find((x) => x.p === p);
        return (
          <div key={p} className="solo-line drill-line">
            <span>{nm}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={def.max}
              placeholder="–"
              aria-label={`${label}: ${nm}`}
              disabled={!canP(p)}
              value={v === undefined ? '' : String(v)}
              onChange={(e) => {
                const n = parseScoreValue(e.target.value);
                if (n !== null && n > def.max) return;
                onSolo(p, skey, n);
              }}
            />
            {onTapSolo && (
              <>
                <span className={c.done ? 'drill-progress done' : 'drill-progress'}>
                  {c.done ? `Všechny pokusy: ${c.value} z ${def.max}` : v === undefined ? `pokus 0 / ${def.max}` : `${c.value} (pokus ${c.attempts} / ${def.max})`}
                </span>
                {!c.done && (
                  <>
                    <button type="button" className="chip-btn ok" aria-label={`${def.ok}: ${nm}`} disabled={!canP(p)} onClick={() => tap(true)}>
                      ✓
                    </button>
                    <button type="button" className="chip-btn fail" aria-label={`${def.fail}: ${nm}`} disabled={!canP(p)} onClick={() => tap(false)}>
                      ✗
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="chip-btn"
                  aria-label={`Zpět: ${nm}`}
                  disabled={!last || !canP(p)}
                  onClick={() => {
                    if (!last) return;
                    onTapSolo(p, skey, def, last.ok, -1);
                    setUndo((u) => {
                      const i = u.lastIndexOf(last);
                      return u.filter((_, j) => j !== i);
                    });
                  }}
                >
                  ↶
                </button>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

interface Props {
  row: ScheduleRow;
  waitingLabel: string;
  training: Training;
  names: Record<PlayerId, string>;
  onScore(id: MatchId, s: Score): void;
  onSolo(playerId: PlayerId, key: SoloKey, value: number | null): void;
  /** Smí přihlášený zapisovat do zápasu / za hráče ve skupině? (výchozí ano) */
  canMatch?(m: Match): boolean;
  canSolo?(group: PlayerId[], playerId: PlayerId): boolean;
  tap?: TapEntry;
  /** Průběh rozbalený (Moje hry); v rozpisu sbalený. */
  timelineOpen?: boolean;
  /** Pokusy cvičení ✓ / ✗ (notebook i telefon). */
  onTapSolo?: TapSolo;
  /** Zdržovači: Zahájit / Ukončit u každého stolu; skóre jde zadat až po zahájení. */
  timing?: ItemTiming;
  /** Jen jeden stůl (index v row.cells) – tužka v rozpisu u konkrétního stolu (19. 11. 2026). */
  only?: number;
  /** Nápověda je jinde (Moje hry: otazník v hlavičce kola, 19. 11. 2026). */
  noHelp?: boolean;
  /**
   * Organizátor v Rozpisu (bez stopek): potvrdí konec utkání bez výsledku – Rozcvičky (19. 11. 2026; dřív v Živě).
   */
  onEnd?(id: string): void;
  /**
   * Moje hry (19. 11. 2026): jen samotný zápis – bez stopek, Připraven, překryvu „Dohráno“ a Průběhu;
   * stav, Připraven, Potvrdit konec a Průběh má karta kola a akční zóna v MyTable.
   */
  bare?: boolean;
  /** Oprava výsledku (Moje hry): zrcadlo rovnou v úpravách. */
  fix?: boolean;
}

/** Jedna nápověda – stejný formát pro všechny bloky (nadpis + odstavce se štítky). */
export function HelpItem({ title, item }: { title?: string; item: ExplanationItem }) {
  return (
    <section className="help-item">
      {title && <h4>{title}</h4>}
      {item.parts.map((p, i) => (
        <p key={i}>
          {p.label && <span className="k">{p.label}</span>} {p.text}
        </p>
      ))}
    </section>
  );
}

/** Leg BO zápasu: „Leg 2 6:4“ (stav na stole). */
const legText = (m: Match, s: Score | undefined) => {
  const [a, b] = tableScore(m, s);
  return `${a}:${b}`;
};

/**
 * Skóre utkání: ťukání (telefon) nebo výběr (notebook). Zápas s BO (12. 11. 2026) má legy po sobě –
 * zapisuje se do hraného legu, předchozí jde otevřít a opravit; nahoře stav v legech.
 */
export function MatchScore({ m, training, names, label, tap, disabled, note, onScore, timelineOpen, lock, done, ended, noTimeline, editInit }: {
  ended?: boolean;
  editInit?: boolean;
  /** Bez Průběhu (Moje hry: graf ukazuje akční zóna po konci). */
  noTimeline?: boolean;
  lock?: Parameters<typeof ScoreMirror>[0]['lock'];
  done?: Parameters<typeof ScoreMirror>[0]['done'];
  m: Match;
  training: Training;
  names: Record<PlayerId, string>;
  label: string;
  tap?: TapEntry;
  disabled: boolean;
  note?: string;
  onScore(id: MatchId, s: Score): void;
  timelineOpen: boolean;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const st = matchState(m, training.scores);
  const multi = (m.bestOf ?? 1) > 1;
  const lastLeg = st.legs[st.legs.length - 1].leg;
  const leg = st.legs.find((l) => l.leg.legNo === picked)?.leg ?? st.current ?? lastLeg;
  const evs = (training.events ?? []).filter((e) => e.itemId === leg.id);
  const pt = training.playTimes?.[m.id];
  const first = evs.length ? Math.min(...evs.map((e) => e.at)) : 0;
  const last = evs.length ? Math.max(...evs.map((e) => e.at)) : 0;
  // Konec osy: potvrzený konec, u rozehrané hry „teď“, jinak poslední ťuknutí.
  const to = pt?.endedAt ?? (pt?.startedAt !== undefined ? Date.now() : last);
  return (
    <>
      {multi && (
        <div className="legs" role="group" aria-label={`Legy: ${label}`}>
          <span className="legs-score">
            BO{m.bestOf} · {st.legsA}:{st.legsB}
            {st.over ? ' · konec' : ''}
          </span>
          {st.legs.map((l) => (
            <button
              key={l.leg.id}
              type="button"
              className="pill"
              aria-pressed={l.leg.id === leg.id}
              onClick={() => setPicked(l.leg.legNo ?? 1)}
            >
              Leg {l.leg.legNo}
              {l.over ? ` ${legText(l.leg, l.score)}` : ''}
            </button>
          ))}
        </div>
      )}
      {tap ? (
        <ScoreMirror key={leg.id} match={leg} score={training.scores[leg.id]} names={names} me={tap.me} disabled={disabled} note={note} lock={lock} done={done} ended={ended} editInit={editInit} onBump={(f, d) => tap.onBumpScore(leg, f, d)} />
      ) : (
        <ScorePicker label={multi ? `${label}, leg ${leg.legNo}` : label} match={leg} score={training.scores[leg.id]} names={names} disabled={disabled} onChange={(sc) => onScore(leg.id, sc)} />
      )}
      {/* Moje hry: Průběh až po dohrání utkání (19. 11. 2026); během hry jen zápis. */}
      <TimelineBox count={noTimeline || (timelineOpen && !ended) ? 0 : evs.length} open={timelineOpen}>
        <MatchTimeline match={leg} events={evs} from={(leg.legNo ?? 1) > 1 ? first : (pt?.startedAt ?? first)} to={to} names={names} />
      </TimelineBox>
    </>
  );
}

/** Má hra ťukané události (zápas: kterýkoli leg)? Jen pak má smysl Průběh. */
export function hasProgress(training: Training, itemId: string, m?: Match): boolean {
  const all = training.events ?? [];
  const ids = m ? new Set(legIds(m)) : new Set([itemId]);
  return all.some((e) => ids.has(e.itemId));
}

/**
 * Průběh jedné hry bez zápisu (18. 11. 2026): zápas po legech, cvičení po hráčích; vždy rozbalený.
 * Nic se neukáže, když hra nemá ťukané události.
 */
export function ItemProgress({ itemId, match: m, players, training, names }: { itemId: string; match?: Match; players: PlayerId[]; training: Training; names: Record<PlayerId, string> }) {
  const all = training.events ?? [];
  if (!m) {
    const evs = all.filter((e) => e.itemId === itemId);
    return (
      <TimelineBox count={evs.length} open>
        <DrillTimeline players={players} events={evs} names={names} />
      </TimelineBox>
    );
  }
  const st = matchState(m, training.scores);
  const pt = training.playTimes?.[m.id];
  const legs = st.legs.filter((l) => all.some((e) => e.itemId === l.leg.id));
  const count = legs.reduce((n, l) => n + all.filter((e) => e.itemId === l.leg.id).length, 0);
  return (
    <TimelineBox count={count} open>
      {legs.map((l) => {
        const evs = all.filter((e) => e.itemId === l.leg.id);
        const first = Math.min(...evs.map((e) => e.at));
        const last = Math.max(...evs.map((e) => e.at));
        const from = (l.leg.legNo ?? 1) > 1 ? first : (pt?.startedAt ?? first);
        const to = pt?.endedAt ?? (pt?.startedAt !== undefined && !l.over ? Date.now() : last);
        return (
          <div key={l.leg.id} className="tl-leg">
            {legs.length > 1 && <span className="tl-leg-k">Leg {l.leg.legNo} · {legText(l.leg, l.score)}</span>}
            <MatchTimeline match={l.leg} events={evs} from={from} to={to} names={names} />
          </div>
        );
      })}
    </TimelineBox>
  );
}

/** Průběh dohrané hry v přechodu Moje hry (stůl řádku rozpisu). */
export function GameProgress({ row, table, training, names }: { row: ScheduleRow; table: number; training: Training; names: Record<PlayerId, string> }) {
  const c = row.cells[table - 1];
  if (!c) return null;
  if (c.type === 'group') return <ItemProgress itemId={drillItemId(row, table, c.players)} players={c.players} training={training} names={names} />;
  return <ItemProgress itemId={c.match.id} match={c.match} players={[...c.match.sideA, ...c.match.sideB]} training={training} names={names} />;
}

/** Je pro kolo nějaká nápověda (pravidla, stanoviště)? */
export function hasRoundHelp(row: ScheduleRow): boolean {
  const ex = explanationsFor(row);
  return ex.main.length > 0 || ex.general.length > 0 || ex.perTable.some(Boolean);
}

/**
 * Obsah nápovědy kola: co disciplína trénuje, stanoviště po stolech, pravidla. `untitledMain`: hlavní pravidlo
 * bez nadpisu – název disciplíny je v hlavičce karty (Moje hry, 19. 11. 2026).
 */
export function RoundHelp({ row, untitledMain }: { row: ScheduleRow; untitledMain?: boolean }) {
  const ex = explanationsFor(row);
  return (
    <>
      {row.discipline && <SkillTags skills={discipline(row.discipline)?.skills} />}
      {ex.perTable.some(Boolean) && (
        <div className="help-grid">
          {ex.perTable.map((it, j) => (it ? <HelpItem key={j} title={`Stůl ${j + 1}: ${explanationTitle(it.name)}`} item={it} /> : <div key={j} />))}
        </div>
      )}
      {ex.main.map((it) => (
        <HelpItem key={it.name} title={untitledMain ? undefined : explanationTitle(it.name)} item={it} />
      ))}
      {ex.general.map((it) => (
        <HelpItem key={it.name} title={explanationTitle(it.name)} item={it} />
      ))}
    </>
  );
}

export function BlockEntry({ row, waitingLabel, training, names, onScore, onSolo, canMatch = () => true, canSolo = () => true, tap, timing, onTapSolo, timelineOpen = false, only, noHelp, onEnd, bare = false, fix = false }: Props) {
  /** Průběh cvičení u stolu (sloupec / křivky pokusů). */
  const drillBox = (players: PlayerId[], r: ScheduleRow, j: number) => {
    if (bare) return null;
    const id = drillItemId(r, j + 1, players);
    const evs = (training.events ?? []).filter((e) => e.itemId === id);
    // Moje hry: Průběh až po dohrání (19. 11. 2026).
    const ended = timing?.state(id)?.endedAt !== undefined;
    return (
      <TimelineBox count={timelineOpen && !ended ? 0 : evs.length} open={timelineOpen}>
        <DrillTimeline players={players} events={evs} names={names} />
      </TimelineBox>
    );
  };
  /** Stopky stolu + jestli už jde zapisovat (zahájeno, nebo výsledek už je – oprava). */
  const timer = (id: string, players: PlayerId[], _hasResult: boolean, finished: boolean, m?: Match, countdown = false, inMirror = false) => {
    const st = timing?.state(id);
    // Zapisovat jde až po zahájení (všichni připravení) – nikdo, ani organizátor, dřív (19. 11. 2026, *rozhodnutí
    // uživatele*). Ukončené utkání jde opravit. Celkový výsledek bez stopek (tužka v rozpisu) timing nemá → bez omezení.
    const open = !timing || !st || st.startedAt !== undefined || st.endedAt !== undefined;
    const bar = !bare && timing && st && (
      <TimingBar
        state={st}
        now={timing.now}
        canWrite={timing.canWrite(id, players, m)}
        allowStart={timing.allowStart}
        manage={timing.manage}
        finished={finished}
        countdown={countdown}
        autoEndIn={timing.autoEndIn?.(id)}
        hideReady={inMirror && !open}
        hideFinish={inMirror}
        {...(timing.ready && timing.canReady ? { slots: readySlots(players, m), onReady: (key: string, on: boolean) => timing.ready!(id, key, on, readyKeys({ match: m, players })) } : {})}
        onStart={() => timing.start(id)}
        onEnd={() => timing.end(id)}
      />
    );
    return { open, bar };
  };
  const nm = (ids: PlayerId[]) => ids.map((id) => names[id] ?? '?').join(' + ');
  /** Připravenost (18. 11. 2026): strany zápasu (jména), u cvičení každý hráč. */
  const readySlots = (players: PlayerId[], m?: Match): ReadySlot[] =>
    (m ? [{ key: 'A', label: nm(m.sideA) }, { key: 'B', label: nm(m.sideB) }] : players.map((p) => ({ key: p, label: names[p] ?? '?' }))).map((x) => ({
      ...x,
      can: timing?.canReady?.(x.key, { match: m, players }) ?? false,
    }));
  const ex = explanationsFor(row);
  // Rozhodčí u stolu se ukazuje v kartě; pod kartami jen ti, kdo nejsou u žádného stolu.
  const refs = new Set(row.cells.flatMap((c) => (c?.type === 'match' && c.match.referee ? [c.match.referee] : [])));
  const unassigned = row.waiting.filter((p) => !refs.has(p));
  /**
   * Moje hry před zahájením (19. 11. 2026, *rozhodnutí uživatele*): místo zápisu jen velké Připraven a stav stran –
   * výběr skóre, pokusy ani Průběh se neukazují, dokud nejsou připravení všichni.
   */
  const readyGate = (id: string, players: PlayerId[], open: boolean, can: boolean, m?: Match): ReactNode | null => {
    if (!timing?.allowStart || !timing.ready || !timing.canReady || open || !can) return null;
    const st = timing.state(id);
    if (!st) return null;
    return <ReadyLock s={st} slots={readySlots(players, m)} onReady={(key, on) => timing.ready!(id, key, on, readyKeys({ match: m, players }))} />;
  };

  const hasHelp = ex.main.length > 0 || ex.general.length > 0 || ex.perTable.some(Boolean);
  const helpTitle = ex.perTable.some(Boolean)
    ? 'Nápověda ke stanovištím'
    : `Nápověda: ${[...ex.main.map((i) => i.name), ...ex.general.map((i) => i.name.toLocaleLowerCase('cs'))].join(', ')}`;
  const scenario = /^Start /.test(row.rule ?? '');
  return (
    <div className="block-entry">
      <div className="entry-cards">
        {row.cells.map((c, j) => {
          if (!c || (only !== undefined && j !== only)) return null;
          const label = `${row.label}, stůl ${j + 1}`;
          if (c.type === 'match') {
            const m = c.match;
            const st = matchState(m, training.scores);
            const players = [...m.sideA, ...m.sideB];
            // Telefon (zrcadlo): Připraven a potvrzení konce přímo v zrcadle (18. 11. 2026).
            const inMirror = !!tap && !!timing;
            const tmr = timer(m.id, players, legIds(m).some((id) => !isEmptyScore(training.scores[id])), st.over, m, false, inMirror && canMatch(m));
            const can = canMatch(m) && tmr.open;
            const ist = timing?.state(m.id);
            const gate = bare ? null : readyGate(m.id, players, tmr.open, canMatch(m), m);
            // Dohráno, nepotvrzeno a smím potvrdit (hráč po zahájení, organizátor vždy).
            const mayEnd =
              !!ist && ist.endedAt === undefined && timing!.canWrite(m.id, players, m) && (timing!.manage || (timing!.allowStart && ist.startedAt !== undefined));
            const tsc = st.legs[st.legs.length - 1];
            const done =
              !bare && inMirror && st.over && mayEnd
                ? {
                    text: (m.bestOf ?? 1) > 1 ? `Dohráno ${st.legsA}:${st.legsB} na legy ✓` : `Dohráno ${legText(tsc.leg, tsc.score)} ✓`,
                    autoEndIn: timing!.autoEndIn?.(m.id) ?? null,
                    onConfirm: () => timing!.end(m.id),
                  }
                : undefined;
            return (
              <div key={j} className="entry-card" role="group" aria-label={label}>
                <div className="entry-head">
                  Stůl {j + 1}, {m.kind === 'doubles' ? 'dvojice' : 'singl'}
                  {setScores(m) && ', sety'}
                </div>
                <span className="visually-hidden">
                  {nm(m.sideA)} vs {nm(m.sideB)}
                </span>
                {gate ?? (
                  <>
                {tmr.bar}
                <MatchScore
                  m={m}
                  training={training}
                  names={names}
                  label={label}
                  tap={tap}
                  disabled={!can}
                  note={canMatch(m) && !tmr.open ? 'Skóre jde zapsat po zahájení utkání.' : undefined}
                  done={done}
                  ended={ist?.endedAt !== undefined}
                  onScore={onScore}
                  timelineOpen={timelineOpen}
                  noTimeline={bare}
                  editInit={fix}
                />
                  </>
                )}
                {m.block === 'league' && (m.trackLosses || m.referee) && (
                  <p className="entry-ref">
                    {m.trackLosses
                      ? `Daň za ztrátu: ztráta se hned počítá jako gól soupeře. ${m.referee ? `Rozhodčí: ${names[m.referee] ?? '?'}, čárkuje ztráty` : 'Bez rozhodčího, ztráty zapisují hráči'}`
                      : `Rozhodčí: ${names[m.referee!] ?? '?'}`}
                  </p>
                )}
              </div>
            );
          }
          if (c.discipline === 'warmup') {
            const wid = drillItemId(row, j + 1, c.players);
            // Bez stopek (Rozpis, organizátor): časy přímo z tréninku.
            const startedAt = timing ? timing.state(wid)?.startedAt : training.playTimes?.[wid]?.startedAt;
            const endedAt = timing ? timing.state(wid)?.endedAt : training.playTimes?.[wid]?.endedAt;
            const now = timing?.now ?? Date.now();
            const wtmr = timer(wid, c.players, false, startedAt !== undefined && warmupState((now - startedAt) / 1000).done, undefined, true);
            return (
              <div key={j} className="entry-card" role="group" aria-label={label}>
                <div className="entry-head">Stůl {j + 1}</div>
                <span className="entry-players">{c.players.map((p) => names[p] ?? '?').join(', ')}</span>
                {wtmr.bar}
                <WarmupTimer startedAt={startedAt} endedAt={endedAt} now={now} compact={!tap && !timing?.allowStart} />
                {!timing && onEnd && endedAt === undefined && (
                  <button type="button" className="ghost" onClick={() => onEnd(wid)}>
                    Potvrdit konec
                  </button>
                )}
              </div>
            );
          }
          if (!c.metric) return null;
          const def = soloMetric(c.metric);
          const gkey = soloKey(c.metric, c.soloRound);
          const gtmr = timer(
            drillItemId(row, j + 1, c.players),
            c.players,
            c.players.some((p) => training.soloResults[p]?.[gkey] !== undefined),
            c.players.every((p) => drillCount({ value: training.soloResults[p]?.[gkey], attempts: training.soloAttempts?.[p]?.[gkey] }, def).done),
          );
          const canP = (p: PlayerId) => canSolo(c.players, p) && gtmr.open;
          const dgate = bare ? null : readyGate(drillItemId(row, j + 1, c.players), c.players, gtmr.open, c.players.some((p) => canSolo(c.players, p)));
          if (dgate)
            return (
              <div key={j} className="entry-card" role="group" aria-label={label}>
                <div className="entry-head">Stůl {j + 1}</div>
                {dgate}
              </div>
            );
          if (def.streak) {
            // Čistá desítka: notebook i telefon ťukají stejně (čas se měří od zahájení stolu).
            const item = drillItemId(row, j + 1, c.players);
            return (
              <div key={j} className="entry-card" role="group" aria-label={label}>
                <div className="entry-head">Stůl {j + 1}</div>
                {gtmr.bar}
                <StreakMirror
                  key={gkey}
                  players={c.players}
                  def={def}
                  states={Object.fromEntries(c.players.map((p) => [p, trainingStreak(training, p, item, def)]))}
                  names={names}
                  now={timing?.now ?? Date.now()}
                  limitSec={streakLimitSec(training, gkey)}
                  canSolo={canP}
                  onTap={(p, ok, d) => (tap?.onTapSolo ?? onTapSolo)?.(p, gkey, def, ok, d)}
                />
                {drillBox(c.players, row, j)}
              </div>
            );
          }
          if (tap) {
            const key = gkey;
            return (
              <div key={j} className="entry-card" role="group" aria-label={label}>
                <div className="entry-head">Stůl {j + 1}</div>
                {gtmr.bar}
                <DrillMirror
                  key={key}
                  players={c.players}
                  def={def}
                  values={Object.fromEntries(c.players.map((p) => [p, { value: training.soloResults[p]?.[key], attempts: training.soloAttempts?.[p]?.[key] }]))}
                  names={names}
                  canSolo={canP}
                  onTap={(p, ok, d) => (tap.onTapSolo ?? onTapSolo)?.(p, key, def, ok, d)}
                  editInit={fix}
                />
                {drillBox(c.players, row, j)}
              </div>
            );
          }
          return (
            <div key={j} className="entry-card" role="group" aria-label={label}>
              <div className="entry-head">Stůl {j + 1}</div>
              {gtmr.bar}
              <div className="entry-metric">
                <strong>{def.name}</strong>
                <span>{def.what}</span>
              </div>
              <DrillRows
                key={gkey}
                label={label}
                players={c.players}
                def={def}
                skey={gkey}
                training={training}
                names={names}
                canP={canP}
                onSolo={onSolo}
                onTapSolo={onTapSolo}
              />
              {drillBox(c.players, row, j)}
            </div>
          );
        })}
      </div>
      <div className="entry-foot">
        {scenario && <p className="entry-warn">Zapisuje se stav na stole, startovní góly appka odečte sama.</p>}
        {only === undefined && unassigned.length > 0 && (
          <p className="muted">
            {refs.size ? 'Čeká' : (row.waitingLabel ?? waitingLabel)}: {unassigned.map((p) => names[p] ?? '?').join(', ')}
          </p>
        )}
        {hasHelp && !noHelp && (
          <details className="help">
            <summary>{helpTitle}</summary>
            <RoundHelp row={row} />
          </details>
        )}
      </div>
    </div>
  );
}
