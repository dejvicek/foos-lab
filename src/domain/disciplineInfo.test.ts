import { DISCIPLINES } from './disciplines';
import { disciplineDuration, disciplineFacts, disciplineHelp, disciplineWho, MATCH_GENERAL_HELP, offeredDisciplines, disciplineScope } from './disciplineInfo';

describe('stránka Disciplíny – obsah', () => {
  it('nabízí jen nevyřazené disciplíny v pořadí rozpisu', () => {
    const ids = offeredDisciplines().map((d) => d.id);
    expect(ids).toEqual(DISCIPLINES.filter((d) => !d.retired).map((d) => d.id));
    expect(ids).not.toContain('setShooting');
    expect(ids).not.toContain('backRodsBuildUp');
    expect(ids).toContain('chain');
  });

  it('každá nabízená disciplína má vysvětlivku (Cíl / Provedení / …)', () => {
    for (const d of offeredDisciplines()) expect(disciplineHelp(d.id).length, d.id).toBeGreaterThan(0);
    expect(disciplineHelp('fiveBarControl').map((i) => i.name)).toEqual(['Udržení míče na pětce']);
    // Start 0:3 se hraje s Daní → obě vysvětlivky (stejně jako v nápovědě kola)
    expect(disciplineHelp('start03').map((i) => i.name)).toEqual(['Start 0:3', 'Daň za ztrátu']);
    expect(disciplineHelp('singles').map((i) => i.name)).toEqual(['Normální leg']);
  });

  it('délka, kdo hraje a podrobnosti jen z definice disciplíny', () => {
    expect(disciplineDuration('warmupPasses')).toEqual({ rounds: 1, min: 8 });
    expect(disciplineDuration('penaltyKeeper')).toEqual({ rounds: 2, min: 8 });
    expect(disciplineDuration('wall')).toEqual({ rounds: 2, min: 8 });
    expect(disciplineWho('warmupPasses')).toEqual({ icon: 'pair', label: 's bránícím soupeřem' });
    expect(disciplineWho('fiveBarControl')?.icon).toBe('solo');
    expect(disciplineWho('wall')?.icon).toBe('swap');
    expect(disciplineWho('normal')).toBeNull();
    expect(disciplineFacts('passWallLane')).toEqual(['2 kola po 20: ke zdi / po lajně', 'jde i sám']);
    expect(disciplineFacts('penaltyKeeper')).toEqual(['2 kola po 20 pokusech, variantu si určí hráč', 's bránícím soupeřem']);
    expect(disciplineFacts('start45')).toEqual(['2 kola, strany si prohodí role']);
    expect(disciplineDuration('chain')).toEqual({ rounds: 1, min: 8 });
    expect(disciplineFacts('chain')).toEqual(['s bránícím soupeřem']);
    expect(disciplineHelp('chain').map((i) => i.name)).toEqual(['Řetězec']);
    expect(disciplineFacts('singles')).toEqual(['jen singly']);
    expect(disciplineFacts('sim')).toEqual(['od 4 hráčů']);
  });

  it('obecná pravidla zápasů', () => {
    expect(MATCH_GENERAL_HELP.map((i) => i.name)).toEqual(['Každý gól se počítá', 'Role rozhodčího']);
  });

  it('kde se hraje (12. 11. 2026): Čistá desítka jen vlastní, simulace jen klubový, ostatní obojí', () => {
    expect(disciplineScope('streakShot3')).toBe('practice');
    expect(disciplineScope('sim')).toBe('club');
    for (const id of ['warmup', 'penaltySolo', 'warmupPasses', 'normal', 'goalieWar', 'wall'] as const) expect(disciplineScope(id)).toBeNull();
  });
});
