import { useState } from 'react';
import { DISCIPLINES, roundMin } from '../../domain/disciplines';
import { matchesSkillFilter, SKILL_GROUPS, skillName, type Skill, type SkillFilter, type SkillGroupId } from '../../domain/skills';
import { SkillLegend, SkillTags } from './SkillTags';
import { DURATION_OPTIONS, fillPlan, plannedMinutes, playable, SIM_MIN_PLAYERS } from '../../domain/plan';
import { lockedCounts } from '../../domain/training';
import type { DisciplineId, Training } from '../../domain/types';

export const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const KIND_TITLE = { drill: 'Cvičení', match: 'Zápasy', sim: 'Tým' } as const;

/**
 * Posuvník s hodnotou vedle a popisky pod ním (délka tréninku, počet hráčů v šabloně).
 * Popisky sedí pod středem jezdce (ten jde od půlky jeho šířky po druhou půlku).
 */
export function RangeField({
  id,
  label,
  min,
  max,
  step = 1,
  value,
  ticks,
  format = String,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  ticks: number[];
  format?(v: number): string;
  onChange(v: number): void;
}) {
  return (
    <div className="field range-field">
      <label htmlFor={id}>{label}</label>
      <div className="range-row">
        <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={format(value)} onChange={(e) => onChange(Number(e.target.value))} />
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <div className="range-ticks" aria-hidden="true">
        {ticks.map((m) => (
          <span key={m} style={{ left: `calc(var(--thumb) / 2 + ${(m - min) / (max - min)} * (100% - var(--thumb)))` }}>
            {format(m)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** PRD 4.6 / 7: délka tréninku posuvníkem (1:00–4:00 po 15 min); hodnota vedle, pod ním orientační hodiny. */
export function DurationSelect({ training, onChange }: { training: Training; onChange(next: Training): void }) {
  return (
    <RangeField
      id="t-duration"
      label="Délka tréninku"
      min={DURATION_OPTIONS[0]}
      max={DURATION_OPTIONS[DURATION_OPTIONS.length - 1]}
      step={DURATION_OPTIONS[1] - DURATION_OPTIONS[0]}
      value={training.durationMin}
      ticks={DURATION_OPTIONS.filter((m) => m % 60 === 0)}
      format={hm}
      onChange={(v) => onChange({ ...training, durationMin: v })}
    />
  );
}

export function DisciplinePicker({ training, open, onChange, bare }: { training: Training; open: boolean; onChange(next: Training): void; bare?: boolean }) {
  // Filtr podle štítků (sekce v legendě, štítek u disciplíny); skryté disciplíny zůstávají v plánu.
  const [filter, setFilter] = useState<SkillFilter>({ skills: [], groups: [] });
  // Štítky jsou ve výchozím stavu schované; skrytí zruší i filtr.
  const [showTags, setShowTags] = useState(false);
  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const toggleSkill = (s: Skill) => setFilter((f) => ({ ...f, skills: toggle(f.skills, s) }));
  const toggleGroup = (g: SkillGroupId) => setFilter((f) => ({ ...f, groups: toggle(f.groups, g) }));
  const offered = DISCIPLINES.filter((d) => !d.retired || (training.plan[d.id] ?? 0) > 0);
  const visible = offered.filter((d) => matchesSkillFilter(d.skills, filter));
  const filtering = filter.skills.length + filter.groups.length > 0;
  const mins = training.disciplineMin ?? null;
  const used = plannedMinutes(training.plan, training.attendees.length, training.breaks, mins);
  const over = used > training.durationMin;
  // Zbývá čas: nabídnout doplnění kol (zápasy, bez nich cvičení) do délky tréninku.
  const filled = over ? training.plan : fillPlan(training.plan, training.durationMin, training.attendees.length, training.breaks ?? null, mins);
  const canFill = !over && plannedMinutes(filled, training.attendees.length, training.breaks, mins) > used;
  const locked = lockedCounts(training);
  const setCount = (id: DisciplineId, n: number) => onChange({ ...training, plan: { ...training.plan, [id]: Math.max(locked[id] ?? 0, n) } });
  const badge = (
    <>
      <span className={over ? 'count-badge over' : 'count-badge'}>
        Naplánováno {hm(used)} z {hm(training.durationMin)}
      </span>
      {over && <span className="error">Nevejde se, uber kola.</span>}
      {canFill && (
        <span className="fill-offer">
          Zbývá {hm(training.durationMin - used)}.
          <button type="button" className="ghost" onClick={() => onChange({ ...training, plan: filled })}>
            Doplnit kola
          </button>
        </span>
      )}
    </>
  );
  const body = (
    <>
      <button
        type="button"
        className="link tags-toggle"
        aria-pressed={showTags}
        onClick={() => {
          if (showTags) setFilter({ skills: [], groups: [] });
          setShowTags(!showTags);
        }}
      >
        {showTags ? 'Skrýt štítky' : 'Ukázat štítky'}
      </button>
      {showTags && <SkillLegend filter={filter} onToggle={toggleGroup} />}
      {filtering && (
        <p className="filter-line">
          Filtr: {[...filter.groups.map((g) => SKILL_GROUPS.find((x) => x.id === g)!.name), ...filter.skills.map(skillName)].join(', ')} · zobrazeno {visible.length} z {offered.length}
          <button type="button" className="link" onClick={() => setFilter({ skills: [], groups: [] })}>
            Zrušit filtr
          </button>
        </p>
      )}
      {(['drill', 'match', 'sim'] as const).filter((kind) => visible.some((d) => d.kind === kind)).map((kind) => (
        <div key={kind} className="disc-group">
          <h3>{KIND_TITLE[kind]}</h3>
          <ul className="disc-list">
            {visible.filter((d) => d.kind === kind).map((d) => {
              // Co se při tomto počtu hráčů nehraje (simulace pod 4; zápasy a cvičení s bránícím pro 1 hráče).
              const off = !playable(d.id, training.attendees.length || undefined);
              const n = off ? 0 : (training.plan[d.id] ?? 0);
              const min = locked[d.id] ?? 0;
              // Zeď, Start 0:3 a cvičení na dvě varianty: kola po dvou.
              const step = d.paired || d.variants ? 2 : 1;
              return (
                <li key={d.id} role="group" aria-label={d.name}>
                  <label>
                    <input
                      type="checkbox"
                      checked={n > 0}
                      disabled={min > 0 || off}
                      onChange={() => setCount(d.id, n > 0 ? 0 : step)}
                    />
                    <span>{d.name}</span>
                  </label>
                  {showTags && <SkillTags skills={d.skills} filter={filter} onToggle={toggleSkill} />}
                  <span className="muted">
                    {off
                      ? `potřebuje aspoň ${d.kind === 'sim' ? SIM_MIN_PLAYERS : 2} hráče`
                      : d.paired
                        ? `${roundMin(d.id, mins)} min, po 2 kolech (obě strany)`
                        : d.variants
                          ? `${roundMin(d.id, mins)} min, po 2 kolech (${d.variants.join(' / ')}, po 10)`
                          : `${roundMin(d.id, mins)} min`}
                  </span>
                  {n > 0 && d.kind !== 'sim' && (
                    <span className="stepper">
                      <button type="button" className="icon" aria-label={`Ubrat kolo: ${d.name}`} disabled={n - step < Math.max(1, min)} onClick={() => setCount(d.id, n - step)}>
                        −
                      </button>
                      <span>{n} ×</span>
                      <button type="button" className="icon" aria-label={`Přidat kolo: ${d.name}`} onClick={() => setCount(d.id, n + step)}>
                        +
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="note">Cvičení má tolik kol, aby se ve dvojicích vystřídali všichni. Zbylý čas appka doplní zápasy; počty jde upravit. Odehraná kola jsou zamčená.</p>
    </>
  );
  if (bare)
    return (
      <div className="disciplines bare">
        <p className="count-line">{badge}</p>
        {body}
      </div>
    );
  return (
    <details className="disciplines step" open={open}>
      <summary className="attendance-head">
        <span className="attendance-title">Disciplíny</span>
        {badge}
      </summary>
      {body}
    </details>
  );
}
