/**
 * Štítky dovedností (3. 11. 2026): co disciplína trénuje – podle rešerše dovedností na elitní úrovni
 * (pravidla ITSF, trenérské materiály). U disciplíny 1–3 štítky, hlavní první.
 * Od 9. 11. 2026 sadu spravuje admin na stránce Disciplíny (katalog, catalog.ts); tady je výchozí sada.
 * Štítek má stálé `id` (disciplíny ho odkazují), název se dá přejmenovat.
 */
export type SkillGroupId = 'attack' | 'defense' | 'technique' | 'tactics' | 'mind' | 'match';

/** ID štítku. */
export type Skill = string;

export interface SkillDef {
  id: Skill;
  name: string;
  group: SkillGroupId;
}

/** Sekce štítků – pevné, podle nich se štítky barví. */
export const SKILL_GROUPS: { id: SkillGroupId; name: string }[] = [
  { id: 'attack', name: 'Útok' },
  { id: 'defense', name: 'Obrana' },
  { id: 'technique', name: 'Technika' },
  { id: 'tactics', name: 'Taktika' },
  { id: 'mind', name: 'Hlava' },
  { id: 'match', name: 'Zápas' },
];

export const DEFAULT_SKILLS: readonly SkillDef[] = [
  { id: 'shot3', name: 'Střela z trojky', group: 'attack' },
  { id: 'shot2', name: 'Střela z dvojky', group: 'attack' },
  { id: 'pass5', name: 'Přihrávka z pětky', group: 'attack' },
  { id: 'control', name: 'Kontrola míče', group: 'technique' },
  { id: 'defense', name: 'Obrana', group: 'defense' },
  { id: 'buildUp2', name: 'Rozehrávka z dvojky', group: 'technique' },
  { id: 'clearing', name: 'Clearing', group: 'defense' },
  { id: 'looseBall', name: 'Zachycení volného míče', group: 'defense' },
  { id: 'reading', name: 'Čtení soupeře', group: 'tactics' },
  { id: 'tempo', name: 'Tempo a trpělivost', group: 'tactics' },
  { id: 'clutch', name: 'Koncovky pod tlakem', group: 'mind' },
  { id: 'comeback', name: 'Dotahování', group: 'mind' },
  { id: 'doubles', name: 'Dvojice', group: 'match' },
  { id: 'matchPlay', name: 'Zápasová praxe', group: 'match' },
];

/** Aktuální sada štítků (výchozí, nebo z katalogu – nastavuje applyCatalog). */
export let SKILLS: readonly SkillDef[] = DEFAULT_SKILLS;

export function setSkills(list: readonly SkillDef[]): void {
  SKILLS = list;
}

export const skillDef = (id: Skill): SkillDef | undefined => SKILLS.find((s) => s.id === id);
export const skillName = (id: Skill): string => skillDef(id)?.name ?? id;
export const skillGroup = (id: Skill) => SKILL_GROUPS.find((g) => g.id === (skillDef(id)?.group ?? 'match'))!;
/** Štítky disciplíny v pořadí sekcí legendy (Útok … Zápas); uvnitř sekce pořadí z disciplíny. */
export function bySkillGroup(skills: readonly Skill[] | undefined): Skill[] {
  const rank = (s: Skill) => SKILL_GROUPS.indexOf(skillGroup(s));
  return [...(skills ?? [])].sort((a, b) => rank(a) - rank(b));
}
/** Štítky sekce v pořadí sady. */
export const skillsIn = (group: SkillGroupId): SkillDef[] => SKILLS.filter((s) => s.group === group);

/** Filtr disciplín podle štítků: vybrané štítky a sekce se sčítají (stačí jedna shoda). */
export interface SkillFilter {
  skills: Skill[];
  groups: SkillGroupId[];
}

export function matchesSkillFilter(skills: readonly Skill[] | undefined, f: SkillFilter): boolean {
  if (!f.skills.length && !f.groups.length) return true;
  return (skills ?? []).some((s) => f.skills.includes(s) || f.groups.includes(skillGroup(s).id));
}
