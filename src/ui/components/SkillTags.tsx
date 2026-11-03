import type { Skill } from '../../domain/skills';

/** Štítky dovedností disciplíny (hlavní první, zvýrazněný). */
export function SkillTags({ skills }: { skills?: Skill[] }) {
  if (!skills?.length) return null;
  return (
    <ul className="skill-tags" aria-label="Trénuje">
      {skills.map((s, i) => (
        <li key={s} className={i === 0 ? 'main' : undefined}>
          {s}
        </li>
      ))}
    </ul>
  );
}
