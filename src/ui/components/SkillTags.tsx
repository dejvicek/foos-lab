import { SKILL_GROUPS, skillGroup, type Skill } from '../../domain/skills';

/** Štítky dovedností disciplíny, barva podle sekce (Útok, Obrana, …). */
export function SkillTags({ skills }: { skills?: Skill[] }) {
  if (!skills?.length) return null;
  return (
    <ul className="skill-tags" aria-label="Trénuje">
      {skills.map((s) => (
        <li key={s} className={`g-${skillGroup(s).id}`}>
          {s}
        </li>
      ))}
    </ul>
  );
}

/** Legenda sekcí – nad seznamem disciplín. */
export function SkillLegend() {
  return (
    <ul className="skill-tags skill-legend" aria-label="Sekce dovedností">
      {SKILL_GROUPS.map((g) => (
        <li key={g.id} className={`g-${g.id}`} title={g.skills.join(', ')}>
          {g.name}
        </li>
      ))}
    </ul>
  );
}
