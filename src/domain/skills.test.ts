import { DISCIPLINES, discipline } from './disciplines';
import { matchesSkillFilter, SKILL_GROUPS, SKILLS, skillGroup } from './skills';

describe('štítky dovedností u disciplín (3. 11. 2026)', () => {
  it('každá nabízená disciplína má 1–3 štítky ze sady, hlavní první', () => {
    for (const d of DISCIPLINES.filter((x) => !x.retired)) {
      expect(d.skills?.length, d.id).toBeGreaterThanOrEqual(1);
      expect(d.skills!.length, d.id).toBeLessThanOrEqual(3);
      for (const s of d.skills!) expect(SKILLS).toContain(s);
    }
  });

  it('sada štítků a příklady přiřazení (bez slova „zadek“)', () => {
    for (const k of SKILLS) expect(k).not.toMatch(/zad(ek|ku)/i);
    expect(SKILLS).toEqual([
      'Střela z trojky', 'Střela z dvojky', 'Přihrávka z pětky', 'Kontrola míče', 'Obrana', 'Rozehrávka z dvojky', 'Clearing',
      'Zachycení volného míče', 'Čtení soupeře', 'Tempo a trpělivost', 'Koncovky pod tlakem', 'Dotahování', 'Dvojice', 'Zápasová praxe',
    ]);
    expect(discipline('penaltyKeeper').skills).toEqual(['Střela z trojky', 'Obrana', 'Čtení soupeře']);
    expect(discipline('clearing').skills![0]).toBe('Clearing');
    expect(discipline('looseBall').skills![0]).toBe('Zachycení volného míče');
    expect(discipline('start55').skills).toEqual(['Koncovky pod tlakem']);
    // každý štítek je u nějaké nabízené disciplíny
    for (const s of SKILLS) expect(DISCIPLINES.some((d) => !d.retired && d.skills?.includes(s)), s).toBe(true);
  });
});

describe('sekce štítků (barvy)', () => {
  it('každý štítek patří do jedné sekce; sekce v pořadí Útok, Obrana, Technika, Taktika, Hlava, Zápas', () => {
    expect(SKILL_GROUPS.map((g) => g.name)).toEqual(['Útok', 'Obrana', 'Technika', 'Taktika', 'Hlava', 'Zápas']);
    for (const s of SKILLS) expect(SKILL_GROUPS.filter((g) => (g.skills as readonly string[]).includes(s)), s).toHaveLength(1);
    expect(skillGroup('Clearing').id).toBe('defense');
    expect(skillGroup('Střela z trojky').id).toBe('attack');
    expect(skillGroup('Koncovky pod tlakem').id).toBe('mind');
  });
});

it('filtr podle štítků: prázdný pustí vše; jinak stačí shoda se štítkem nebo sekcí', () => {
  expect(matchesSkillFilter(['Clearing'], { skills: [], groups: [] })).toBe(true);
  expect(matchesSkillFilter(['Clearing'], { skills: ['Clearing'], groups: [] })).toBe(true);
  expect(matchesSkillFilter(['Střela z trojky', 'Obrana'], { skills: [], groups: ['defense'] })).toBe(true);
  expect(matchesSkillFilter(['Zápasová praxe'], { skills: ['Clearing'], groups: ['attack'] })).toBe(false);
  expect(matchesSkillFilter(undefined, { skills: ['Clearing'], groups: [] })).toBe(false);
});
