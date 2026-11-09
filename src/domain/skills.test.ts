import { DISCIPLINES, discipline } from './disciplines';
import { DEFAULT_SKILLS, matchesSkillFilter, SKILL_GROUPS, SKILLS, skillGroup, skillName, skillsIn } from './skills';

const names = (ids?: string[]) => (ids ?? []).map(skillName);

describe('štítky dovedností u disciplín (3. 11. 2026)', () => {
  it('každá nabízená disciplína má 1–3 štítky ze sady, hlavní první', () => {
    const ids = SKILLS.map((s) => s.id);
    for (const d of DISCIPLINES.filter((x) => !x.retired)) {
      expect(d.skills?.length, d.id).toBeGreaterThanOrEqual(1);
      expect(d.skills!.length, d.id).toBeLessThanOrEqual(3);
      for (const s of d.skills!) expect(ids).toContain(s);
    }
  });

  it('výchozí sada štítků a příklady přiřazení (bez slova „zadek“)', () => {
    for (const k of DEFAULT_SKILLS) expect(k.name).not.toMatch(/zad(ek|ku)/i);
    expect(DEFAULT_SKILLS.map((s) => s.name)).toEqual([
      'Střela z trojky', 'Střela z dvojky', 'Přihrávka z pětky', 'Kontrola míče', 'Obrana', 'Rozehrávka z dvojky', 'Clearing',
      'Zachycení volného míče', 'Čtení soupeře', 'Tempo a trpělivost', 'Koncovky pod tlakem', 'Dotahování', 'Dvojice', 'Zápasová praxe',
    ]);
    expect(new Set(DEFAULT_SKILLS.map((s) => s.id)).size).toBe(DEFAULT_SKILLS.length);
    expect(names(discipline('penaltyKeeper').skills)).toEqual(['Střela z trojky', 'Obrana', 'Čtení soupeře']);
    expect(names(discipline('clearing').skills)[0]).toBe('Clearing');
    expect(names(discipline('looseBall').skills)[0]).toBe('Zachycení volného míče');
    expect(names(discipline('start55').skills)).toEqual(['Koncovky pod tlakem']);
    // každý štítek je u nějaké nabízené disciplíny
    for (const s of DEFAULT_SKILLS) expect(DISCIPLINES.some((d) => !d.retired && d.skills?.includes(s.id)), s.name).toBe(true);
  });
});

describe('sekce štítků (barvy)', () => {
  it('každý štítek patří do jedné sekce; sekce v pořadí Útok, Obrana, Technika, Taktika, Hlava, Zápas', () => {
    expect(SKILL_GROUPS.map((g) => g.name)).toEqual(['Útok', 'Obrana', 'Technika', 'Taktika', 'Hlava', 'Zápas']);
    expect(skillGroup('clearing').id).toBe('defense');
    expect(skillGroup('shot3').id).toBe('attack');
    expect(skillGroup('clutch').id).toBe('mind');
    expect(skillsIn('defense').map((s) => s.name)).toEqual(['Obrana', 'Clearing', 'Zachycení volného míče']);
  });
});

it('filtr podle štítků: prázdný pustí vše; jinak stačí shoda se štítkem nebo sekcí', () => {
  expect(matchesSkillFilter(['clearing'], { skills: [], groups: [] })).toBe(true);
  expect(matchesSkillFilter(['clearing'], { skills: ['clearing'], groups: [] })).toBe(true);
  expect(matchesSkillFilter(['shot3', 'defense'], { skills: [], groups: ['defense'] })).toBe(true);
  expect(matchesSkillFilter(['matchPlay'], { skills: ['clearing'], groups: ['attack'] })).toBe(false);
  expect(matchesSkillFilter(undefined, { skills: ['clearing'], groups: [] })).toBe(false);
});
