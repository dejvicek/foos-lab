import { useMemo, useState, type ReactNode } from 'react';
import { cleanFormats, formatMins, formatOf } from '../../domain/matchFormat';
import { MatchFormatPicker } from './MatchFormatPicker';
import { addBreakAt, anchorBreaks, breakMovable, disciplineStepTarget, freeSlots, moveBreak, removeBreak, setBreakMin } from '../../domain/breaks';
import { currentTemplates, matchingTemplate, templateRounds } from '../../domain/catalog';
import { roundSequence } from '../../domain/customSchedule';
import { clubOffered, DISCIPLINES, roundMin, roundStep } from '../../domain/disciplines';
import { fairness, neverCount } from '../../domain/fairness';
import { CHANGEOVER_MIN, fillPlan, orderedDisciplines, planTimeline, plannedMinutes, playable, SIM_MIN_PLAYERS } from '../../domain/plan';
import { buildSchedule, canBuildSchedule } from '../../domain/schedule';
import { matchesSkillFilter, SKILL_GROUPS, skillName, type Skill, type SkillFilter, type SkillGroupId } from '../../domain/skills';
import { clockAt } from '../../domain/solo';
import { lockedCounts, moveDiscipline, selectedDisciplines, withTemplate } from '../../domain/training';
import type { DisciplineId, PlayerId, Training } from '../../domain/types';
import { plural } from '../format';
import { hm } from './DisciplinePicker';
import { FairnessReport } from './FairnessPanel';
import { PlanPreview, type Highlight } from './PlanPreview';
import { CountStepper, endLiner, FreeRow, GapButton, KIND_TITLE, KINDS, MoveButtons, PauseRow, PlanMeter, rowHeight, SectionHead, TimeCell, type Kind, type Span } from './PlanTable';
import { SkillLegend, SkillTags } from './SkillTags';

type View = 'plan' | 'rounds' | 'who';
type Plan = Training['plan'];

const def = (id: DisciplineId) => DISCIPLINES.find((d) => d.id === id)!;

/**
 * Krok Disciplíny v průvodci (10. 11. 2026, varianta C): šablony jako záložky, souhrn (čas a kontrola
 * rozpisu) a pod ním tři pohledy – Plán disciplín (tabulka jako na stránce Šablony), Kolo po kole
 * (náhled plánu s hráči, pauzy po kolech) a Kdo s kým (kontrola rozpisu).
 */
export function DisciplineStep({
  training,
  names,
  hl,
  onChange,
  onSaveTemplate,
}: {
  training: Training;
  names: Record<PlayerId, string>;
  hl: Highlight;
  onChange(t: Training): void;
  /** Admin: uloží nastavení disciplín jako novou šablonu; vrací chybu, nebo null. */
  onSaveTemplate?(name: string): string | null;
}) {
  const [view, setView] = useState<View>('plan');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const t = training;
  const n = t.attendees.length;
  // Zápas s BO: kolo = délka legu × nejvyšší počet legů.
  const mins = formatMins(t.disciplineMin ?? null, t.matchFormats);
  const tl = planTimeline(roundSequence(t), t.breaks, mins);
  const over = tl.total - t.durationMin;
  const fmt = (m: number) => clockAt(t.startTime, m);
  // Změna kol / pořadí: pauzy zůstanou za svou disciplínou.
  const editPlan = (plan: Plan) => onChange({ ...t, plan, breaks: anchorBreaks(t) });

  const used = plannedMinutes(t.plan, n, t.breaks, mins);
  const filled = over > 0 ? t.plan : fillPlan(t.plan, t.durationMin, n, t.breaks ?? null, mins);
  const canFill = over <= 0 && plannedMinutes(filled, n, t.breaks, mins) > used;

  const check = useMemo(() => {
    if (!canBuildSchedule(t)) return null;
    const f = fairness(buildSchedule(t), t.attendees);
    const sits = t.attendees.map((p) => f.sits.get(p) ?? 0);
    return {
      pairs: (n * (n - 1)) / 2,
      neverWith: n >= 4 ? neverCount(f, t.attendees, 'together') : null,
      neverAgainst: neverCount(f, t.attendees, 'against'),
      sitMin: Math.min(...sits),
      sitMax: Math.max(...sits),
    };
  }, [t, n]);
  const warnings = check ? (check.neverWith ?? 0) + check.neverAgainst : 0;

  const gauge = (label: string, never: number, pairs: number) => (
    <button type="button" className={never ? 'gauge warn' : 'gauge'} aria-label={`${label}: ${pairs - never} z ${pairs} dvojic`} onClick={() => setView('who')}>
      <span className="gauge-dot" aria-hidden="true" />
      <span className="gauge-k">{label}</span>
      <b>
        {pairs - never}/{pairs}
      </b>
    </button>
  );

  const tab = (id: View, label: string, extra?: ReactNode) => (
    <button type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>
      {label}
      {extra}
    </button>
  );

  return (
    <div className="disc-step">
      <TemplateTabs
        training={t}
        onChange={onChange}
        action={
          onSaveTemplate && (
            <span className="disc-tpl-action">
              {saved && !saving && (
                <span className="tpl-saved-note" role="status">
                  Uloženo jako šablona „{saved}“
                </span>
              )}
              {!saving && (
                <button type="button" className="link" onClick={() => (setSaving(true), setSaved(null))}>
                  Uložit jako šablonu
                </button>
              )}
            </span>
          )
        }
      />
      {saving && onSaveTemplate && (
        <SaveTemplateForm
          onSave={(name) => {
            const error = onSaveTemplate(name);
            if (!error) {
              setSaved(name.trim());
              setSaving(false);
            }
            return error;
          }}
          onCancel={() => setSaving(false)}
        />
      )}
      <div className="tt-sticky disc-sticky">
        <div className="disc-summary">
          <p className={`tt-summary${over > 0 ? ' over' : ''}`} role="status" aria-label="Naplánováno">
            <b>
              Naplánováno {hm(tl.total)} z {hm(t.durationMin)}
            </b>
            <PlanMeter items={tl.items} total={tl.total} durationMin={t.durationMin} />
            <span>{over > 0 ? `přes o ${hm(over)}` : over === 0 ? 'přesně' : `zbývá ${-over} min`}</span>
            <span className="disc-end">konec {fmt(tl.total)}</span>
          </p>
          {canFill && (
            <button type="button" className="ghost disc-fill" onClick={() => editPlan(filled)}>
              Doplnit kola
            </button>
          )}
        </div>
        {over > 0 && (
          <p className="disc-over" role="alert">
            Plán ({hm(tl.total)}) je delší než trénink ({hm(t.durationMin)}). Zahájit jde i tak – časy jsou orientační; kola jde ubrat v tabulce.
          </p>
        )}
        {check && (
          <div className="gauges" role="group" aria-label="Kontrola rozpisu">
            {check.neverWith === null ? <span className="gauge">Spolu: ve dvojicích se nehraje</span> : gauge('Spolu', check.neverWith, check.pairs)}
            {gauge('Proti sobě', check.neverAgainst, check.pairs)}
            <span className="gauge" aria-label={`Mimo stůl: ${check.sitMin}–${check.sitMax}× za trénink`}>
              <span className="gauge-k">Mimo stůl</span>
              <b>{check.sitMin === check.sitMax ? check.sitMin : `${check.sitMin}–${check.sitMax}`}×</b>
            </span>
          </div>
        )}
      </div>
      <div className="view-tabs" role="tablist" aria-label="Pohled">
        {tab('plan', 'Plán disciplín')}
        {tab('rounds', 'Kolo po kole')}
        {tab(
          'who',
          'Kdo s kým',
          check && <span className={warnings ? 'view-badge' : 'view-badge ok'}>{warnings ? `${warnings} nikdy` : '✓'}</span>,
        )}
      </div>
      <div className="view-body" role="tabpanel">
        {view === 'plan' && <DisciplineTable training={t} tl={tl} fmt={fmt} onChange={onChange} editPlan={editPlan} />}
        {view === 'rounds' && <PlanPreview training={t} onChange={onChange} names={names} hl={hl} />}
        {view === 'who' && (
          <FairnessReport
            training={t}
            names={names}
            hl={hl}
            onAddRounds={(id, k) => editPlan({ ...t.plan, [id]: (t.plan[id] ?? 0) + k })}
          />
        )}
      </div>
    </div>
  );
}

/** Název nové šablony z nastavení tréninku (admin). */
function SaveTemplateForm({ onSave, onCancel }: { onSave(name: string): string | null; onCancel(): void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="tpl-save-form"
      aria-label="Uložit jako šablonu"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSave(name));
      }}
    >
      <div className="tpl-save-row">
        <label htmlFor="tpl-save-name">Název šablony</label>
        <input id="tpl-save-name" type="text" value={name} placeholder="např. Úterý 2 h" autoFocus onChange={(e) => (setName(e.target.value), setError(null))} />
        <button type="submit">Uložit šablonu</button>
        <button type="button" className="ghost" onClick={onCancel}>
          Zrušit
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="note">
        Uloží se délka, vybrané disciplíny v tomto pořadí, počty kol zápasů a pauzy. Cvičení mají v šabloně tolik kol, aby se vystřídali všichni přítomní.
        Nová šablona se přidá na konec, výchozí zůstává. Upravit nebo smazat ji jde na stránce Šablony.
      </p>
    </form>
  );
}

/** Šablony jako záložky (jako na stránce Šablony), vidět i jediná. Upravený výběr = „Vlastní výběr“. */
function TemplateTabs({ training, onChange, action }: { training: Training; onChange(t: Training): void; action?: ReactNode }) {
  const templates = currentTemplates();
  if (!templates.length) return action ? <div className="tpl-tabs disc-tpl-tabs">{action}</div> : null;
  const current = matchingTemplate(templates, training.durationMin, selectedDisciplines(training.plan));
  return (
    <div className="tpl-tabs disc-tpl-tabs" role="tablist" aria-label="Šablona">
      <span className="disc-tpl-label">Šablona</span>
      {templates.map((x, i) => (
        <button key={x.id} type="button" role="tab" aria-selected={current?.id === x.id} className="tpl-tab" onClick={() => onChange(withTemplate(training, x))}>
          {x.name}
          <span className="tpl-tab-dur">{hm(x.durationMin)}</span>
          {i === 0 && <span className="tpl-default">výchozí</span>}
        </button>
      ))}
      {!current && (
        <span role="tab" aria-selected="true" className="tpl-tab custom">
          Vlastní výběr
          <span className="tpl-tab-dur">{hm(training.durationMin)}</span>
        </span>
      )}
      {action}
    </div>
  );
}

/** Pauza v tabulce: patří za disciplínu, po jejímž kole je; `mid` = po kolikátém kole, když není po posledním. */
interface PauseAt {
  index: number;
  span: Span;
  min: number;
  mid: number | null;
}

function DisciplineTable({
  training: t,
  tl,
  fmt,
  onChange,
  editPlan,
}: {
  training: Training;
  tl: ReturnType<typeof planTimeline>;
  fmt(m: number): string;
  onChange(t: Training): void;
  editPlan(plan: Plan): void;
}) {
  const [filter, setFilter] = useState<SkillFilter>({ skills: [], groups: [] });
  const [showTags, setShowTags] = useState(false);
  const [drag, setDrag] = useState<DisciplineId | null>(null);
  const [dropAt, setDropAt] = useState<DisciplineId | null>(null);
  const toggle = <X,>(xs: X[], x: X) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const toggleSkill = (s: Skill) => setFilter((f) => ({ ...f, skills: toggle(f.skills, s) }));
  const toggleGroup = (g: SkillGroupId) => setFilter((f) => ({ ...f, groups: toggle(f.groups, g) }));
  const filtering = filter.skills.length + filter.groups.length > 0;

  const n = t.attendees.length;
  // Zápas s BO: kolo = délka legu × nejvyšší počet legů.
  const mins = formatMins(t.disciplineMin ?? null, t.matchFormats);
  const locked = lockedCounts(t);
  const seq = roundSequence(t);
  const free = new Set(freeSlots(t));
  const endLine = endLiner(t.durationMin, fmt);
  const used = plannedMinutes(t.plan, n, t.breaks, mins);

  // Úseky disciplín a pauzy za nimi.
  const spans = new Map<DisciplineId, Span>();
  const pauses = new Map<DisciplineId, PauseAt[]>();
  const done = new Map<DisciplineId, number>();
  let prev: DisciplineId | null = null;
  for (const it of tl.items) {
    if (it.kind === 'round') {
      const id = it.discipline!;
      const s = spans.get(id);
      spans.set(id, { start: s?.start ?? it.start, end: it.start + it.min + CHANGEOVER_MIN });
      done.set(id, (done.get(id) ?? 0) + 1);
      prev = id;
    } else if (prev) {
      const k = done.get(prev)!;
      const all = seq.filter((x) => x === prev).length;
      pauses.set(prev, [...(pauses.get(prev) ?? []), { index: it.index!, span: { start: it.start, end: it.start + it.min }, min: it.min, mid: k < all ? k : null }]);
    }
  }
  const played = (id: DisciplineId) => spans.has(id);
  const order = orderedDisciplines(t.disciplineOrder);
  const chosenIn = (kind: Kind) => order.filter((id) => def(id).kind === kind && played(id));
  const lastKind = KINDS.filter((k) => chosenIn(k).length).at(-1);

  const roundsCell = (id: DisciplineId) => {
    const d = def(id);
    if (d.kind === 'sim') return <span className="tt-rounds">1×</span>;
    const step = roundStep(d);
    return (
      <CountStepper
        n={t.plan[id] ?? 0}
        step={step}
        min={Math.max(1, locked[id] ?? 0)}
        max={40}
        lessLabel={`Ubrat kolo: ${d.name}`}
        moreLabel={`Přidat kolo: ${d.name}`}
        countLabel={`Počet kol: ${d.name}`}
        onChange={(v) => editPlan({ ...t.plan, [id]: Math.max(locked[id] ?? 0, v) })}
      />
    );
  };

  const nameCell = (id: DisciplineId, checked: boolean, disabled: boolean, onToggle: () => void, note?: ReactNode) => {
    const d = def(id);
    return (
      <span className="tt-name">
        <label className="tpl-check">
          <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
          <span>{d.name}</span>
        </label>
        {note}
        {checked && d.kind === 'match' && (
          <MatchFormatPicker
            id={id}
            name={d.name}
            value={formatOf(t.matchFormats, id)}
            onChange={(f) => onChange({ ...t, matchFormats: cleanFormats({ ...t.matchFormats, [id]: f }) ?? null })}
          />
        )}
        {showTags && <SkillTags skills={d.skills} filter={filter} onToggle={toggleSkill} />}
      </span>
    );
  };

  const pauseRows = (id: DisciplineId) =>
    (pauses.get(id) ?? []).map((p) => {
      const up = disciplineStepTarget(t, p.index, -1);
      const down = disciplineStepTarget(t, p.index, 1);
      const movable = breakMovable(t, p.index);
      return (
        <PauseRow
          key={`pause-${p.index}`}
          span={p.span}
          min={p.min}
          durationMin={t.durationMin}
          label={`Pauza po: ${def(id).name}`}
          name={p.mid === null ? 'Pauza' : `Pauza po ${p.mid}. kole`}
          fmt={fmt}
          end={endLine(p.span)}
          onMin={(m) => onChange(setBreakMin(t, p.index, m))}
          onUp={up === null ? null : () => onChange(moveBreak(t, p.index, up))}
          onDown={down === null ? null : () => onChange(moveBreak(t, p.index, down))}
          onRemove={movable ? () => onChange(removeBreak(t, p.index)) : undefined}
        />
      );
    });

  const offered = DISCIPLINES.filter((d) => clubOffered(d) || (!d.practiceOnly && (t.plan[d.id] ?? 0) > 0));
  const restIn = (kind: Kind) => offered.filter((d) => d.kind === kind && !played(d.id));
  const shownRest = (kind: Kind) => restIn(kind).filter((d) => matchesSkillFilter(d.skills, filter));
  const restCount = KINDS.reduce((s, k) => s + restIn(k).length, 0);
  const shownCount = KINDS.reduce((s, k) => s + shownRest(k).length, 0);

  return (
    <div className="disc-table">
      <div className="disc-tags">
        <button
          type="button"
          className="link"
          aria-pressed={showTags}
          onClick={() => {
            if (showTags) setFilter({ skills: [], groups: [] });
            setShowTags(!showTags);
          }}
        >
          {showTags ? 'Skrýt štítky' : 'Ukázat štítky'}
        </button>
        {showTags && <SkillLegend filter={filter} onToggle={toggleGroup} />}
      </div>
      {filtering && (
        <p className="filter-line">
          Filtr: {[...filter.groups.map((g) => SKILL_GROUPS.find((x) => x.id === g)!.name), ...filter.skills.map(skillName)].join(', ')} · nevybrané: zobrazeno {shownCount} z{' '}
          {restCount}
          <button type="button" className="link" onClick={() => setFilter({ skills: [], groups: [] })}>
            Zrušit filtr
          </button>
        </p>
      )}
      {KINDS.map((kind) => {
        const chosen = chosenIn(kind);
        const rest = shownRest(kind);
        if (!chosen.length && !restIn(kind).length) return null;
        return (
          <section key={kind} className="tpl-sec" aria-label={KIND_TITLE[kind]}>
            <SectionHead kind={kind} chosen={chosen.length} total={chosen.length + restIn(kind).length} />
            {chosen.length > 0 && (
              <ol className="tt-rows" aria-label={`Pořadí: ${KIND_TITLE[kind]}`}>
                {chosen.map((id, i) => {
                  const d = def(id);
                  const span = spans.get(id)!;
                  const rounds = t.plan[id] ?? 0;
                  const after = seq.lastIndexOf(id) + 1;
                  return [
                    <li
                      key={id}
                      className={`tt-row on${span.end > t.durationMin ? ' over' : ''}${drag === id ? ' dragging' : ''}${dropAt === id && drag !== id ? ' drop' : ''}`}
                      style={{ minHeight: rowHeight(span.end - span.start) }}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer?.setData?.('text/plain', d.name);
                        setDrag(id);
                      }}
                      onDragOver={(e) => {
                        if (!drag || def(drag).kind !== kind) return; // jen uvnitř sekce
                        e.preventDefault();
                        setDropAt(id);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (drag && def(drag).kind === kind) onChange(moveDiscipline(t, drag, i));
                        setDrag(null);
                        setDropAt(null);
                      }}
                      onDragEnd={() => (setDrag(null), setDropAt(null))}
                    >
                      <TimeCell span={span} fmt={fmt} />
                      <span className={`tt-strip k-${kind}`} />
                      <span className="tpl-drag" aria-hidden="true" title="Přetáhni na jiné místo">
                        ⠿
                      </span>
                      {nameCell(id, true, (locked[id] ?? 0) > 0, () => editPlan({ ...t.plan, [id]: locked[id] ?? 0 }))}
                      <MoveButtons
                        up={{ label: `Dřív: ${d.name}`, disabled: i === 0, onClick: () => onChange(moveDiscipline(t, id, i - 1)) }}
                        down={{ label: `Později: ${d.name}`, disabled: i === chosen.length - 1, onClick: () => onChange(moveDiscipline(t, id, i + 1)) }}
                      />
                      {roundsCell(id)}
                      <span className="tt-len">{roundMin(id, mins)} min</span>
                      <span className="tpl-total">{rounds * (roundMin(id, mins) + CHANGEOVER_MIN)} min</span>
                      {free.has(after) && <GapButton name={d.name} onClick={() => onChange(addBreakAt(t, id))} />}
                      {endLine(span)}
                    </li>,
                    ...pauseRows(id),
                  ];
                })}
                {kind === lastKind && tl.total < t.durationMin && (
                  <FreeRow span={{ start: tl.total, end: t.durationMin }} fmt={fmt} end={endLine({ start: tl.total, end: t.durationMin })} />
                )}
              </ol>
            )}
            {rest.length > 0 && (
              <ul className="tt-rows tt-more" aria-label={`Další: ${KIND_TITLE[kind]}`}>
                {rest.map((d) => {
                  const ok = playable(d.id, n || undefined) && !(d.kind === 'sim' && n < SIM_MIN_PLAYERS);
                  const delta = ok ? plannedMinutes({ ...t.plan, [d.id]: templateRounds(d.id, n, t.tables) }, n, t.breaks, mins) - used : 0;
                  const note = ok ? undefined : <span className="tt-warn">potřebuje aspoň {d.kind === 'sim' ? SIM_MIN_PLAYERS : 2} hráče</span>;
                  return (
                    <li key={d.id} className="tt-row off">
                      <span className="tt-time" />
                      <span className="tt-strip" />
                      <span />
                      {nameCell(d.id, false, !ok, () => editPlan({ ...t.plan, [d.id]: roundStep(d) }), note)}
                      <span />
                      <span className="tt-rounds" />
                      <span className="tt-len">{roundMin(d.id, mins)} min</span>
                      <span className="tpl-total">
                        {ok ? `+${delta} min` : '–'}
                        {ok && tl.total + delta > t.durationMin && <span className="tt-warn">nevejde se</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      <p className="note">
        Cvičení mají tolik kol, aby se ve dvojicích vystřídali všichni ({n} {plural(n, 'hráč', 'hráči', 'hráčů')}). Pořadí změníš za ⠿ nebo šipkami, pauzu přidáš
        na hraně mezi disciplínami (+ pauza) a šipkami ji posuneš o disciplínu. Po kolech ji jde posunout v záložce Kolo po kole.
      </p>
    </div>
  );
}
