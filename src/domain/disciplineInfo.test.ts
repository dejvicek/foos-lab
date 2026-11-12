import { DISCIPLINES } from './disciplines';
import { disciplineDuration, disciplineFacts, disciplineHelp, disciplineWho, MATCH_GENERAL_HELP, offeredDisciplines, disciplinePlaces } from './disciplineInfo';

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
    // kdo hraje říkají panáčci (disciplinePlaces); ikona v řádku už jen u párového zápasu
    expect(disciplineWho('warmupPasses')).toBeNull();
    expect(disciplineWho('wall')?.icon).toBe('swap');
    expect(disciplineWho('normal')).toBeNull();
    expect(disciplineFacts('passWallLane')).toEqual(['2 kola po 20: ke zdi / po lajně', 'hraje se: solo']);
    expect(disciplineFacts('penaltyKeeper')).toEqual(['2 kola po 20 pokusech, variantu si určí hráč', 's bránícím soupeřem', 'hraje se: klubový trénink, duo']);
    expect(disciplineFacts('start45')).toEqual(['2 kola, strany si prohodí role', 'hraje se: klubový trénink, duo']);
    expect(disciplineDuration('chain')).toEqual({ rounds: 1, min: 8 });
    expect(disciplineFacts('chain')).toEqual(['s bránícím soupeřem', 'hraje se: klubový trénink, duo']);
    expect(disciplineHelp('chain').map((i) => i.name)).toEqual(['Řetězec']);
    expect(disciplineFacts('singles')).toEqual(['jen singly', 'hraje se: klubový trénink, duo']);
    expect(disciplineFacts('sim')).toEqual(['od 4 hráčů', 'hraje se: klubový trénink']);
  });

  it('obecná pravidla zápasů', () => {
    expect(MATCH_GENERAL_HELP.map((i) => i.name)).toEqual(['Každý gól se počítá', 'Role rozhodčího']);
  });

  it('kde se hraje (12. 11. 2026): klub / vlastní sám / vlastní ve dvou', () => {
    const p = (id: Parameters<typeof disciplinePlaces>[0]) => Object.entries(disciplinePlaces(id)).filter(([, v]) => v).map(([k]) => k);
    expect(p('warmup')).toEqual(['club', 'solo', 'duo']);
    expect(p('passWallLane')).toEqual(['solo']); // bez soupeře – jen solo
    expect(p('penaltyKeeper')).toEqual(['club', 'duo']);
    expect(p('penaltySolo')).toEqual(['solo']); // bez brankáře jen vlastní sám
    expect(p('backShotSolo')).toEqual(['solo']);
    expect(p('streakShot3')).toEqual(['solo', 'duo']);
    expect(p('normal')).toEqual(['club']); // v duu je to Jedničky
    expect(p('singles')).toEqual(['club', 'duo']);
    expect(p('sim')).toEqual(['club']);
  });
});
