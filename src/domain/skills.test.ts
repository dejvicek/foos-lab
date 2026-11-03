import { DISCIPLINES, discipline } from './disciplines';
import { SKILLS } from './skills';

describe('štítky dovedností u disciplín (3. 11. 2026)', () => {
  it('každá nabízená disciplína má 1–3 štítky ze sady, hlavní první', () => {
    for (const d of DISCIPLINES.filter((x) => !x.retired)) {
      expect(d.skills?.length, d.id).toBeGreaterThanOrEqual(1);
      expect(d.skills!.length, d.id).toBeLessThanOrEqual(3);
      for (const s of d.skills!) expect(SKILLS).toContain(s);
    }
  });

  it('sada štítků a příklady přiřazení', () => {
    expect(SKILLS).toEqual([
      'Střela z trojky', 'Střela ze zadku', 'Přihrávka z pětky', 'Kontrola míče', 'Obrana zadku', 'Rozehrávka ze zadku', 'Clearing',
      'Zachycení volného míče', 'Čtení soupeře', 'Tempo a trpělivost', 'Koncovky pod tlakem', 'Dotahování', 'Dvojice', 'Zápasová praxe',
    ]);
    expect(discipline('penaltyKeeper').skills).toEqual(['Střela z trojky', 'Obrana zadku', 'Čtení soupeře']);
    expect(discipline('clearing').skills![0]).toBe('Clearing');
    expect(discipline('looseBall').skills![0]).toBe('Zachycení volného míče');
    expect(discipline('start55').skills).toEqual(['Koncovky pod tlakem']);
    // každý štítek je u nějaké nabízené disciplíny
    for (const s of SKILLS) expect(DISCIPLINES.some((d) => !d.retired && d.skills?.includes(s)), s).toBe(true);
  });
});
