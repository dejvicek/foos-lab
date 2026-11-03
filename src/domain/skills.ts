/**
 * Štítky dovedností (3. 11. 2026): co disciplína trénuje – podle rešerše dovedností na elitní úrovni
 * (pravidla ITSF, trenérské materiály). U disciplíny 1–3 štítky, hlavní první.
 */
export const SKILLS = [
  'Střela z trojky',
  'Střela ze zadku',
  'Přihrávka z pětky',
  'Kontrola míče',
  'Obrana zadku',
  'Rozehrávka ze zadku',
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
