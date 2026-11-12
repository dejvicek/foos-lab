import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cleanFormats, formatOf } from '../../domain/matchFormat';
import { MatchFormatPicker } from './MatchFormatPicker';
import { CountStepper, endLiner, FreeRow, GapButton, KINDS, MoveButtons, PauseRow, PlanMeter, rowHeight, SectionHead, TimeCell, KIND_TITLE, type Kind, type Span } from './PlanTable';
import { blankTemplate, saveTemplates, templatePlan, templateTimeline, trainingTemplates, validateTemplates, type CatalogData, type TrainingTemplate } from '../../domain/catalog';
import { catalogMins, clubOffered, DISCIPLINES, type DisciplineMins } from '../../domain/disciplines';
import { defaultMatchRounds, DURATION_OPTIONS, playable } from '../../domain/plan';
import { sortTrainings } from '../../domain/training';
import type { DisciplineId, Training } from '../../domain/types';
import { hm, RangeField } from './DisciplinePicker';
import { TablesField } from './TrainingSetup';
import { MAX_PLAYERS } from '../../domain/schedule';
import { MinStepper } from './MinStepper';

const def = (id: DisciplineId) => DISCIPLINES.find((d) => d.id === id)!;
const kindOf = (id: DisciplineId): Kind => def(id).kind;
/** Výběr po sekcích (pořadí uvnitř sekce zůstane). */
const byKind = (sel: DisciplineId[]) => KINDS.flatMap((k) => sel.filter((id) => kindOf(id) === k));

/**
 * Admin: šablony tréninku jako jedna tabulka (9. 11. 2026). Po sekcích: vybrané disciplíny v pořadí
 * s časem od–do (výška řádku podle času), počtem kol (zápasy), délkou kola a pauzami mezi nimi;
 * pod nimi nevybrané. Šablona je přesně to, co admin nastaví – nic se nedoplňuje.
 */
export function TemplatesEditor({
  catalog,
  trainings,
  newId,
  onSave,
  onCancel,
  onChange,
  saved = false,
}: {
  catalog: CatalogData;
  trainings: Training[];
  newId(): string;
  onSave(c: CatalogData): void;
  /** Zahodit neuložené změny. */
  onCancel(): void;
  /** Koncept se změnil (skryje „Uloženo“). */
  onChange?(): void;
  saved?: boolean;
}) {
  const last = sortTrainings(trainings)[0];
  // Bez uložených šablon se začíná jednou prázdnou.
  const [draft, setDraft] = useState<TrainingTemplate[]>(() => {
    const saved = trainingTemplates(catalog);
    return saved.length
      ? saved.map((t) => ({ ...t, selection: byKind(t.selection), rounds: { ...t.rounds }, breaks: [...(t.breaks ?? [])] }))
      : [blankTemplate(newId())];
  });
  const [mins, setMins] = useState<DisciplineMins>(() => catalogMins());
  const [tab, setTab] = useState(0);
  const [players, setPlayers] = useState(() => last?.attendees.length || 8);
  const [tables, setTables] = useState<number>(() => last?.tables ?? 4);
  const [drag, setDrag] = useState<DisciplineId | null>(null);
  const [dropAt, setDropAt] = useState<DisciplineId | null>(null);
  const tpl = draft[Math.min(tab, draft.length - 1)];
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else onChange?.();
  }, [draft, mins]);
  const error = validateTemplates(draft, mins);
  const setTpl = (patch: Partial<TrainingTemplate>) => setDraft((xs) => xs.map((t) => (t.id === tpl.id ? { ...t, ...patch } : t)));

  // Čas: kola šablony v pořadí, pauzy po disciplínách.
  const plan = templatePlan(tpl, players, tables);
  const tl = templateTimeline(tpl, players, tables, mins);
  const total = tl.total;
  const over = total - tpl.durationMin;
  const spans = new Map<DisciplineId, Span>();
  const breakSpans = new Map<DisciplineId, Span>();
  let prev: DisciplineId | null = null;
  for (const it of tl.items) {
    if (it.kind === 'round') {
      const id = it.discipline!;
      const s = spans.get(id);
      spans.set(id, { start: s?.start ?? it.start, end: it.start + it.min + 1 });
      prev = id;
    } else if (prev) breakSpans.set(prev, { start: it.start, end: it.start + it.min });
  }
  const played = tpl.selection.filter((id) => spans.has(id));
  const lastPlayed = played.at(-1);
  const breaks = tpl.breaks ?? [];

  const chosenIn = (kind: Kind) => tpl.selection.filter((id) => kindOf(id) === kind);
  const setChosen = (kind: Kind, list: DisciplineId[]) => setTpl({ selection: KINDS.flatMap((k) => (k === kind ? list : chosenIn(k))) });
  const move = (id: DisciplineId, to: number) => {
    const list = chosenIn(kindOf(id));
    const from = list.indexOf(id);
    if (to < 0 || to >= list.length || from === to) return;
    list.splice(from, 1);
    list.splice(to, 0, id);
    setChosen(kindOf(id), list);
  };
  const add = (id: DisciplineId) => setChosen(kindOf(id), [...chosenIn(kindOf(id)), id]);
  // Označit / odznačit vše: vybrané si nechají pořadí, ostatní se přidají za ně v pořadí katalogu.
  const offered = DISCIPLINES.filter(clubOffered).map((d) => d.id);
  const allChosen = offered.every((id) => tpl.selection.includes(id));
  const toggleAll = () =>
    allChosen
      ? setTpl({ selection: [], rounds: {}, breaks: [], formats: undefined })
      : setTpl({ selection: KINDS.flatMap((k) => [...chosenIn(k), ...offered.filter((id) => kindOf(id) === k && !tpl.selection.includes(id))]) });
  const remove = (id: DisciplineId) => {
    const { [id]: _, ...rounds } = tpl.rounds ?? {};
    setTpl({ selection: tpl.selection.filter((x) => x !== id), rounds, breaks: breaks.filter((b) => b.after !== id) });
  };
  const setBreaks = (list: typeof breaks) => setTpl({ breaks: list });
  /** Kam se pauza posune: za předchozí / další hranou disciplínu (ne za poslední, ne tam, kde už pauza je). */
  const breakTarget = (after: DisciplineId, dir: -1 | 1): DisciplineId | null => {
    let i = played.indexOf(after) + dir;
    while (i >= 0 && i < played.length - 1 && breaks.some((b) => b.after === played[i])) i += dir;
    return i >= 0 && i < played.length - 1 ? played[i] : null;
  };
  const moveBreak = (after: DisciplineId, dir: -1 | 1) => {
    const to = breakTarget(after, dir);
    if (to) setBreaks(breaks.map((b) => (b.after === after ? { ...b, after: to } : b)));
  };
  const totalWith = (id: DisciplineId) => templateTimeline({ ...tpl, selection: byKind([...tpl.selection, id]) }, players, tables, mins).total;

  /** Čára „konec“ uvnitř řádku, do kterého délka tréninku padne. */
  const endLine = endLiner(tpl.durationMin, hm);
  const lastKindWithRounds = KINDS.filter((k) => chosenIn(k).some((id) => spans.has(id))).at(-1);

  const roundsCell = (id: DisciplineId) => {
    const d = def(id);
    if (d.kind === 'drill')
      return (
        <span className="tt-rounds" title="Cvičení má tolik kol, aby se ve dvojicích vystřídali všichni přítomní.">
          {plan[id] ?? 0}× <small>podle hráčů</small>
        </span>
      );
    if (d.kind === 'sim') return <span className="tt-rounds">1×</span>;
    const step = defaultMatchRounds(id);
    const n = tpl.rounds?.[id] ?? step;
    return (
      <CountStepper
        n={n}
        step={step}
        min={step}
        lessLabel={`Méně kol: ${d.name}`}
        moreLabel={`Víc kol: ${d.name}`}
        countLabel={`Počet kol: ${d.name}`}
        onChange={(v) => setTpl({ rounds: { ...tpl.rounds, [id]: v } })}
      />
    );
  };

  return (
    <form
      className="tpl-editor"
      aria-label="Šablony tréninku"
      onSubmit={(e) => {
        e.preventDefault();
        if (!error) onSave(saveTemplates(catalog, draft, mins));
      }}
    >
      <div className="tpl-tabs" role="tablist" aria-label="Šablony">
        {draft.map((t, i) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === tpl.id} className="tpl-tab" onClick={() => setTab(i)}>
            {t.name || 'Bez názvu'}
            <span className="tpl-tab-dur">{hm(t.durationMin)}</span>
            {i === 0 && <span className="tpl-default">výchozí</span>}
          </button>
        ))}
        <button
          type="button"
          className="tpl-tab add"
          onClick={() => {
            // Nová šablona začíná prázdná (12. 11. 2026): nic vybraného, výchozí délka.
            const names = new Set(draft.map((x) => x.name.trim()));
            let name = 'Nová šablona';
            for (let k = 2; names.has(name); k++) name = `Nová šablona ${k}`;
            setDraft((xs) => [...xs, { ...blankTemplate(newId()), name }]);
            setTab(draft.length);
          }}
        >
          + Šablona
        </button>
      </div>

      <div className="tt-sticky">
        <div className="tpl-params">
          <div className="field">
            <label htmlFor="tpl-name">Název</label>
            <input id="tpl-name" type="text" value={tpl.name} onChange={(e) => setTpl({ name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="tpl-duration">Délka</label>
            <select id="tpl-duration" value={tpl.durationMin} onChange={(e) => setTpl({ durationMin: Number(e.target.value) })}>
              {DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {hm(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="tt-estimate" role="group" aria-label="Odhad">
            <RangeField id="tpl-players" label="Odhad: hráčů" min={1} max={MAX_PLAYERS} value={players} ticks={[1, 4, 7, 10, 13]} onChange={setPlayers} />
            <TablesField name="tpl-tables" label="Odhad: stolů" value={tables} onChange={setTables} />
          </div>
          <span className="tpl-actions-inline">
            {tab > 0 && (
              <button type="button" className="link" onClick={() => (setDraft((xs) => [tpl, ...xs.filter((t) => t.id !== tpl.id)]), setTab(0))}>
                Nastavit jako výchozí
              </button>
            )}
            {draft.length > 1 && (
              <button type="button" className="link" onClick={() => (setDraft((xs) => xs.filter((t) => t.id !== tpl.id)), setTab(0))}>
                Smazat šablonu
              </button>
            )}
          </span>
        </div>
        <p className={`tt-summary${over > 0 ? ' over' : ''}`} role="status" aria-label="Naplánováno">
          <b>
            Naplánováno {hm(total)} z {hm(tpl.durationMin)}
          </b>
          <PlanMeter items={tl.items} total={total} durationMin={tpl.durationMin} />
          <span>{over > 0 ? `přes o ${hm(over)}` : over === 0 ? 'přesně' : `zbývá ${-over} min`}</span>
        </p>
      </div>

      <div className="tpl-body">
        <ul className="tt-help" aria-label="Nápověda">
          <li>
            <b>Pauza:</b> najeď myší na hranu mezi dvěma disciplínami a klikni na <span className="tt-help-btn">+ pauza</span> (na telefonu je tlačítko vidět vždy). Délku pauzy změníš v jejím řádku, šipkami ↑ ↓ ji
            posuneš o disciplínu, × ji odebereš. Pauza jde jen mezi disciplíny, po poslední ne.
          </li>
          <li>
            <b>Kola:</b> zápasy − / + (párové po dvou), cvičení mají tolik kol, aby se vystřídali všichni přítomní. Trénink dostane přesně kola ze šablony, nic se nedoplňuje.
          </li>
          <li>
            <b>Délka kola</b> (− / +) platí pro všechny šablony a pro nové tréninky.
          </li>
        </ul>
        <div className="tpl-all">
          <button type="button" className="ghost" onClick={toggleAll}>
            {allChosen ? 'Odznačit vše' : 'Označit vše'}
          </button>
        </div>
        {KINDS.map((kind) => {
          const chosen = chosenIn(kind);
          const rest = DISCIPLINES.filter((d) => clubOffered(d) && d.kind === kind && !tpl.selection.includes(d.id));
          return (
            <section key={kind} className="tpl-sec" aria-label={KIND_TITLE[kind]}>
              <SectionHead kind={kind} chosen={chosen.length} total={chosen.length + rest.length} />
              {chosen.length > 0 && (
                <ol className="tt-rows" aria-label={`Pořadí: ${KIND_TITLE[kind]}`}>
                  {chosen.map((id, i) => {
                    const d = def(id);
                    const span = spans.get(id);
                    const n = plan[id] ?? 0;
                    const brk = breaks.find((b) => b.after === id);
                    const bspan = breakSpans.get(id);
                    const rows: ReactNode[] = [
                      <li
                        key={id}
                        className={`tt-row on${span && span.end > tpl.durationMin ? ' over' : ''}${drag === id ? ' dragging' : ''}${dropAt === id && drag !== id ? ' drop' : ''}`}
                        style={{ minHeight: span ? rowHeight(span.end - span.start) : undefined }}
                        draggable
                        onDragStart={() => setDrag(id)}
                        onDragOver={(e) => {
                          if (!drag || kindOf(drag) !== kind) return; // jen uvnitř sekce
                          e.preventDefault();
                          setDropAt(id);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (drag && kindOf(drag) === kind) move(drag, i);
                          setDrag(null);
                          setDropAt(null);
                        }}
                        onDragEnd={() => (setDrag(null), setDropAt(null))}
                      >
                        <TimeCell span={span} fmt={hm} />
                        <span className={`tt-strip k-${kind}`} />
                        <span className="tpl-drag" aria-hidden="true" title="Přetáhni na jiné místo">
                          ⠿
                        </span>
                        <span className="tt-name">
                          <label className="tpl-check">
                            <input type="checkbox" checked onChange={() => remove(id)} />
                            <span>{d.name}</span>
                          </label>
                          {d.kind === 'match' && (
                            <MatchFormatPicker id={id} name={d.name} value={formatOf(tpl.formats, id)} onChange={(f) => setTpl({ formats: cleanFormats({ ...tpl.formats, [id]: f }) })} />
                          )}
                        </span>
                        <MoveButtons
                          up={{ label: `Dřív: ${d.name}`, disabled: i === 0, onClick: () => move(id, i - 1) }}
                          down={{ label: `Později: ${d.name}`, disabled: i === chosen.length - 1, onClick: () => move(id, i + 1) }}
                        />
                        {roundsCell(id)}
                        <MinStepper value={mins[id] ?? d.min} label={d.name} onChange={(v) => setMins((x) => ({ ...x, [id]: v }))} />
                        <span className="tpl-total">
                          {playable(id, players) ? `${n * ((mins[id] ?? d.min) * formatOf(tpl.formats, id).bestOf + 1)} min` : <span className="tt-warn">při {players} hráčích se nehraje</span>}
                        </span>
                        {!brk && span && id !== lastPlayed && <GapButton name={d.name} onClick={() => setBreaks([...breaks, { after: id, min: 10 }])} />}
                        {span && endLine(span)}
                      </li>,
                    ];
                    if (brk && bspan)
                      rows.push(
                        <PauseRow
                          key={`${id}-pause`}
                          span={bspan}
                          min={brk.min}
                          durationMin={tpl.durationMin}
                          label={`Pauza po: ${d.name}`}
                          fmt={hm}
                          end={endLine(bspan)}
                          onMin={(min) => setBreaks(breaks.map((b) => (b.after === id ? { ...b, min } : b)))}
                          onUp={breakTarget(id, -1) ? () => moveBreak(id, -1) : null}
                          onDown={breakTarget(id, 1) ? () => moveBreak(id, 1) : null}
                          onRemove={() => setBreaks(breaks.filter((b) => b.after !== id))}
                        />,
                      );
                    return rows;
                  })}
                  {kind === lastKindWithRounds && over < 0 && <FreeRow span={{ start: total, end: tpl.durationMin }} fmt={hm} end={endLine({ start: total, end: tpl.durationMin })} />}
                </ol>
              )}
              {rest.length > 0 && (
                <ul className="tt-rows tt-more" aria-label={`Další: ${KIND_TITLE[kind]}`}>
                  {rest.map((d) => {
                    const ok = playable(d.id, players);
                    const delta = ok ? totalWith(d.id) - total : 0;
                    return (
                      <li key={d.id} className="tt-row off">
                        <span className="tt-time" />
                        <span className="tt-strip" />
                        <span />
                        <label className="tpl-check">
                          <input type="checkbox" checked={false} onChange={() => add(d.id)} />
                          <span>{d.name}</span>
                        </label>
                        <span />
                        <span className="tt-rounds" />
                        <MinStepper value={mins[d.id] ?? d.min} label={d.name} onChange={(v) => setMins((x) => ({ ...x, [d.id]: v }))} />
                        <span className="tpl-total">
                          {ok ? `+${delta} min` : '–'}
                          {ok && total + delta > tpl.durationMin && <span className="tt-warn">nevejde se</span>}
                          {!ok && <span className="tt-warn">nehraje se</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {error && <p className="error">{error}</p>}
        <div className="actions-row">
          <button type="submit" disabled={!!error}>
            Uložit šablony
          </button>
          <button type="button" className="ghost" onClick={onCancel}>
            Zahodit změny
          </button>
          {saved && (
            <span className="tt-saved" role="status">
              Uloženo
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
