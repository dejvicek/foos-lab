import { bySkillGroup, SKILL_GROUPS, skillGroup, skillName, skillsIn, type Skill, type SkillFilter, type SkillGroupId } from '../../domain/skills';

/** Štítky dovedností disciplíny v pořadí legendy, barva podle sekce. S `onToggle` jdou kliknutím vybrat do filtru. */
export function SkillTags({ skills, filter, onToggle }: { skills?: Skill[]; filter?: SkillFilter; onToggle?(s: Skill): void }) {
  if (!skills?.length) return null;
  return (
    <ul className="skill-tags" aria-label="Trénuje">
      {bySkillGroup(skills).map((s) => (
        <li key={s} className={`g-${skillGroup(s).id}`}>
          {onToggle ? (
            <button type="button" aria-pressed={!!filter?.skills.includes(s)} onClick={() => onToggle(s)}>
              {skillName(s)}
            </button>
          ) : (
            skillName(s)
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
        <li key={g.id} className={`g-${g.id}`} title={skillsIn(g.id).map((s) => s.name).join(', ')}>
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
