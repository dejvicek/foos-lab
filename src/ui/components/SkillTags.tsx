import { SKILL_GROUPS, skillGroup, type Skill, type SkillFilter, type SkillGroupId } from '../../domain/skills';

/** Štítky dovedností disciplíny, barva podle sekce. S `onToggle` jdou kliknutím vybrat do filtru. */
export function SkillTags({ skills, filter, onToggle }: { skills?: Skill[]; filter?: SkillFilter; onToggle?(s: Skill): void }) {
  if (!skills?.length) return null;
  return (
    <ul className="skill-tags" aria-label="Trénuje">
      {skills.map((s) => (
        <li key={s} className={`g-${skillGroup(s).id}`}>
          {onToggle ? (
            <button type="button" aria-pressed={!!filter?.skills.includes(s)} onClick={() => onToggle(s)}>
              {s}
            </button>
          ) : (
            s
          )}
        </li>
      ))}
    </ul>
  );
}

/** Legenda sekcí – nad seznamem disciplín; s `onToggle` filtruje podle sekce. */
export function SkillLegend({ filter, onToggle }: { filter?: SkillFilter; onToggle?(g: SkillGroupId): void }) {
  return (
    <ul className="skill-tags skill-legend" aria-label="Sekce dovedností">
      {SKILL_GROUPS.map((g) => (
        <li key={g.id} className={`g-${g.id}`} title={g.skills.join(', ')}>
          {onToggle ? (
            <button type="button" aria-pressed={!!filter?.groups.includes(g.id)} onClick={() => onToggle(g.id)}>
              {g.name}
            </button>
          ) : (
            g.name
          )}
        </li>
      ))}
    </ul>
  );
}
