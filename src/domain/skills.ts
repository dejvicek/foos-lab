/**
 * Štítky dovedností (3. 11. 2026): co disciplína trénuje – podle rešerše dovedností na elitní úrovni
 * (pravidla ITSF, trenérské materiály). U disciplíny 1–3 štítky, hlavní první.
 */
export const SKILLS = [
  'Střela z trojky',
  'Střela z dvojky',
  'Přihrávka z pětky',
  'Kontrola míče',
  'Obrana',
  'Rozehrávka z dvojky',
  'Clearing',
  'Zachycení volného míče',
  'Čtení soupeře',
  'Tempo a trpělivost',
  'Koncovky pod tlakem',
  'Dotahování',
  'Dvojice',
  'Zápasová praxe',
] as const;

export type Skill = (typeof SKILLS)[number];

export type SkillGroupId = 'attack' | 'defense' | 'technique' | 'tactics' | 'mind' | 'match';

/** Sekce štítků – podle nich se štítky barví. Každý štítek patří právě do jedné. */
export const SKILL_GROUPS: { id: SkillGroupId; name: string; skills: readonly Skill[] }[] = [
  { id: 'attack', name: 'Útok', skills: ['Střela z trojky', 'Střela z dvojky', 'Přihrávka z pětky'] },
  { id: 'defense', name: 'Obrana', skills: ['Obrana', 'Zachycení volného míče', 'Clearing'] },
  { id: 'technique', name: 'Technika', skills: ['Kontrola míče', 'Rozehrávka z dvojky'] },
  { id: 'tactics', name: 'Taktika', skills: ['Čtení soupeře', 'Tempo a trpělivost'] },
  { id: 'mind', name: 'Hlava', skills: ['Koncovky pod tlakem', 'Dotahování'] },
  { id: 'match', name: 'Zápas', skills: ['Dvojice', 'Zápasová praxe'] },
];

export const skillGroup = (s: Skill) => SKILL_GROUPS.find((g) => g.skills.includes(s))!;

/** Filtr disciplín podle štítků: vybrané štítky a sekce se sčítají (stačí jedna shoda). */
export interface SkillFilter {
  skills: Skill[];
  groups: SkillGroupId[];
}

export function matchesSkillFilter(skills: readonly Skill[] | undefined, f: SkillFilter): boolean {
  if (!f.skills.length && !f.groups.length) return true;
  return (skills ?? []).some((s) => f.skills.includes(s) || f.groups.includes(skillGroup(s).id));
}
