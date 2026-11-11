import { addTemplate, applyCatalog, catalogForm, helpOwner, resetDiscipline, resolveCatalog, saveDiscipline, saveSkills, matchingTemplate, saveTemplates, templatePlan, templateRounds, templateTimeline, trainingTemplates, validateDisciplineForm, validateSkills, validateTemplates, type CatalogData } from './catalog';
import type { DisciplineId } from './types';
import { catalogMins, discipline, DISCIPLINES, roundMin } from './disciplines';
import { explanation, explanationTitle } from './explain';
import { disciplineHelp } from './disciplineInfo';
import { DEFAULT_SKILLS, skillName, SKILLS } from './skills';
import { manualPlan, orderedDisciplines, placeDisciplineBreaks, plannedMinutes, planSequence, planTimeline } from './plan';
import { roundSequence } from './customSchedule';
import { breaksOf, setBreakMin } from './breaks';
import { newTraining, templateFromTraining, withTemplate } from './training';
import { DEFAULT_SELECTION } from '../test/fixtures';

afterEach(() => applyCatalog({}));

describe('katalog disciplín (9. 11. 2026)', () => {
  it('prázdný katalog = výchozí hodnoty z kódu', () => {
    const c = resolveCatalog({});
    expect(c.disciplines.find((d) => d.id === 'wall')).toMatchObject({ name: 'Zeď', min: 8 });
    expect(c.skills).toEqual(DEFAULT_SKILLS);
  });

  it('úprava názvu, délky, štítků a nápovědy se promítne do discipline() a explanation()', () => {
    const data: CatalogData = {
      disciplines: {
        wall: { name: 'Betonová zeď', min: 10, skills: ['tempo'], help: [{ text: 'Nový text.' }] },
      },
    };
    applyCatalog(data);
    expect(discipline('wall')).toMatchObject({ name: 'Betonová zeď', min: 10, skills: ['tempo'] });
    expect(explanation('Zeď').parts).toEqual([{ text: 'Nový text.' }]);
    expect(explanationTitle('Zeď')).toBe('Betonová zeď');
    expect(explanationTitle('Penalta z místa')).toBe('Penalta z místa'); // nepřejmenovaná → název vysvětlivky
    expect(disciplineHelp('wall')[0].parts[0].text).toBe('Nový text.');
    expect(catalogMins().wall).toBe(10);
    // ostatní beze změny
    expect(discipline('normal')).toMatchObject({ name: 'Normální leg', min: 8 });
  });

  it('délka kola v tréninku: snímek z tréninku, bez snímku výchozí z kódu (katalog na staré tréninky nesahá)', () => {
    applyCatalog({ disciplines: { wall: { min: 12 } } });
    expect(roundMin('wall', null)).toBe(8);
    expect(roundMin('wall', { wall: 10 })).toBe(10);
    expect(roundMin('wall', catalogMins())).toBe(12);
  });

  it('nový trénink si uloží délky z katalogu; plán počítá s délkami tréninku', () => {
    applyCatalog({ disciplines: { wall: { min: 10 } } });
    const t = newTraining('t', '2026-11-09', null);
    expect(t.disciplineMin?.wall).toBe(10);
    // 2 kola Zdi + přechody: 2 × (10 + 1) vs. výchozí 2 × (8 + 1)
    expect(plannedMinutes({ wall: 2 }, 8, null, t.disciplineMin)).toBe(22);
    expect(plannedMinutes({ wall: 2 }, 8, null, null)).toBe(18);
  });

  it('správa štítků: přejmenování, přesun do sekce, nový štítek, smazaný zmizí z disciplín', () => {
    const skills = SKILLS.filter((s) => s.id !== 'reading').map((s) => (s.id === 'tempo' ? { ...s, name: 'Trpělivost', group: 'mind' as const } : s));
    applyCatalog(saveSkills({}, [...skills, { id: 'x1', name: 'Nahrávka', group: 'attack' }]));
    expect(skillName('tempo')).toBe('Trpělivost');
    expect(discipline('wall').skills).toEqual(['tempo', 'control']); // reading zmizel
    expect(SKILLS.at(-1)).toEqual({ id: 'x1', name: 'Nahrávka', group: 'attack' });
  });

  it('sdílená nápověda (Jedničky = Normální leg) se ukládá u vlastníka', () => {
    expect(helpOwner('singles')).toBe('normal');
    expect(helpOwner('normal')).toBe('normal');
    const form = catalogForm('singles');
    const data = saveDiscipline({}, 'singles', { ...form, name: 'Singly', help: [{ text: 'Leg do 6.' }] });
    expect(data.disciplines?.singles).toEqual({ name: 'Singly' });
    expect(data.disciplines?.normal).toEqual({ help: [{ text: 'Leg do 6.' }] });
    applyCatalog(data);
    expect(disciplineHelp('normal')[0].parts).toEqual([{ text: 'Leg do 6.' }]);
  });

  it('ukládá jen rozdíly proti výchozím; Obnovit výchozí úpravu smaže', () => {
    const form = catalogForm('clearing');
    expect(saveDiscipline({}, 'clearing', form)).toEqual({});
    const data = saveDiscipline({}, 'clearing', { ...form, min: 5 });
    expect(data).toEqual({ disciplines: { clearing: { min: 5 } } });
    expect(resetDiscipline(data, 'clearing')).toEqual({});
  });

  it('kontrola formuláře a štítků', () => {
    const form = catalogForm('normal');
    expect(validateDisciplineForm(form)).toBeNull();
    expect(validateDisciplineForm({ ...form, name: '  ' })).toBe('Název nesmí být prázdný.');
    expect(validateDisciplineForm({ ...form, min: 0 })).toBe('Délka kola musí být 1–60 minut.');
    expect(validateDisciplineForm({ ...form, min: 7.5 })).toBe('Délka kola musí být 1–60 minut.');
    expect(validateSkills([...DEFAULT_SKILLS, { id: 'n', name: ' obrana ', group: 'attack' }])).toBe('Štítek „obrana“ už existuje.');
    expect(validateSkills([{ id: 'n', name: '', group: 'attack' }])).toBe('Štítek musí mít název.');
    expect(validateSkills(DEFAULT_SKILLS)).toBeNull();
  });

  it('neplatné hodnoty v uloženém katalogu se ignorují (výchozí)', () => {
    applyCatalog({ disciplines: { wall: { name: '', min: -3 } } });
    expect(discipline('wall')).toMatchObject({ name: 'Zeď', min: 8 });
    expect(DISCIPLINES.length).toBeGreaterThan(10);
  });
});

describe('šablony tréninku (9. 11. 2026)', () => {
  it('bez uložených šablon žádná není; nový trénink nemá nic vybráno, 3:00 (10. 11. 2026)', () => {
    expect(trainingTemplates({})).toEqual([]);
    applyCatalog({});
    const t = newTraining('t', '2026-11-10', null);
    expect(t.plan).toEqual({});
    expect(t.durationMin).toBe(180);
    expect(t.breaks).toEqual([]);
    expect(t.disciplineOrder).toEqual([]);
  });

  it('disciplíny nemají povinná / volitelná: uložený příznak z katalogu se ignoruje a při uložení zmizí', () => {
    const data = { disciplines: { wall: { optional: true, min: 9 } } } as unknown as CatalogData;
    applyCatalog(data);
    expect(discipline('wall')).not.toHaveProperty('optional');
    expect(DISCIPLINES.some((d) => 'optional' in d)).toBe(false);
    expect(saveDiscipline(data, 'wall', catalogForm('wall', data))).toEqual({ disciplines: { wall: { min: 9 } } });
  });

  it('nový trénink začne první šablonou (výběr, délka, počet kol), bez pauz a bez doplňování', () => {
    const short = { id: 's', name: 'Krátký', durationMin: 60, selection: ['warmupPasses', 'normal', 'lossTax'] as DisciplineId[] };
    applyCatalog({ templates: [short, { id: 'l', name: 'Dlouhý', durationMin: 180, selection: DEFAULT_SELECTION }] });
    const last = { ...newTraining('x', '2026-11-01', null), durationMin: 120, plan: { wall: 2 } };
    const t = newTraining('t', '2026-11-09', last);
    expect(t.durationMin).toBe(60);
    expect(Object.keys(t.plan).sort()).toEqual(['lossTax', 'normal', 'warmupPasses']);
    expect(t.breaks).toEqual([]);
    expect(t.plan).toEqual({ warmupPasses: 1, normal: 1, lossTax: 1 }); // nic se nedoplní do 1:00
    const withRounds = newTraining('t', '2026-11-09', null, null, { ...short, rounds: { normal: 3 } });
    expect(withRounds.plan.normal).toBe(3);
  });

  it('šablona přesně: cvičení podle hráčů a stolů, zápasy podle počtu kol v šabloně, nic se nedoplňuje', () => {
    const t = (selection: DisciplineId[], rounds = {}) => ({ id: 'x', name: 'X', durationMin: 60, selection, rounds });
    // 8 hráčů / 4 stoly: cvičení 1 vystřídání; Penalta (2 varianty) = 2 kola
    expect(templateTimeline(t(['warmupPasses', 'penaltyKeeper', 'normal']), 8, 4).total).toBe(9 + 2 * 9 + 9);
    expect(templateTimeline(t(['warmupPasses']), 12, 4).total).toBe(2 * 9);
    expect(templateTimeline(t(['normal'], { normal: 3 }), 8, 4).total).toBe(3 * 9);
    expect(templateTimeline(t(['normal']), 8, 4, { normal: 10 }).total).toBe(11);
    // simulace pod 4 hráči se nehraje
    expect(templateTimeline(t(['sim', 'normal']), 3, 2).total).toBe(9);
    expect(templatePlan(t(['wall', 'normal', 'sim'], { normal: 2 }), 8, 4)).toEqual({ normal: 2, wall: 2, sim: 1 });
  });

  it('manualPlan: bez doplňování; zápasy si nechají počet kol, cvičení podle přítomných', () => {
    expect(manualPlan(['normal', 'warmupPasses'], 12, 4, { normal: 3, warmupPasses: 7 })).toEqual({ warmupPasses: 2, normal: 3 });
    expect(manualPlan(['wall'], 8, 4)).toEqual({ wall: 2 });
  });

  it('uložení šablon a délek kol; kontrola', () => {
    const tpls = [{ id: 's', name: 'Krátký', durationMin: 60, selection: ['normal'] as DisciplineId[] }];
    const data = saveTemplates({}, tpls, { ...catalogMins(), normal: 7 });
    expect(data).toEqual({ templates: tpls, disciplines: { normal: { min: 7 } } });
    applyCatalog(data);
    expect(saveTemplates(data, tpls, catalogMins())).toEqual({ templates: tpls, disciplines: { normal: { min: 7 } } });
    expect(saveTemplates(data, tpls, { ...catalogMins(), normal: 8 })).toEqual({ templates: tpls });
    expect(validateTemplates(tpls, catalogMins())).toBeNull();
    expect(validateTemplates([], catalogMins())).toBe('Musí zůstat aspoň jedna šablona.');
    expect(validateTemplates([{ ...tpls[0], name: ' ' }], catalogMins())).toBe('Šablona musí mít název.');
    expect(validateTemplates([tpls[0], { ...tpls[0], id: 'x' }], catalogMins())).toBe('Šablona „Krátký“ už existuje.');
    expect(validateTemplates([{ ...tpls[0], selection: [] }], catalogMins())).toBe('Šablona „Krátký“ nemá žádnou disciplínu.');
    expect(validateTemplates(tpls, { ...catalogMins(), normal: 0 })).toBe('Délka kola musí být 1–60 minut (Normální leg).');
    expect(validateTemplates([{ ...tpls[0], rounds: { wall: 3 } }], catalogMins())).toBe('Počet kol v šabloně „Krátký“ musí být 1–20 (párové po dvou).');
  });

  it('kola v šabloně a šablona tréninku', () => {
    expect(templateRounds('warmupPasses', 8, 4)).toBe(1);
    expect(templateRounds('warmupPasses', 12, 4)).toBe(2);
    expect(templateRounds('penaltyKeeper', 8, 4)).toBe(2);
    expect(templateRounds('wall', 8, 4)).toBe(2);
    expect(templateRounds('normal', 8, 4)).toBe(1);
    expect(templateRounds('normal', 8, 4, { normal: 3 })).toBe(3);
    const tpls = [{ id: 's', name: 'Krátký', durationMin: 60, selection: ['normal', 'wall'] as DisciplineId[] }];
    expect(matchingTemplate(tpls, 60, ['wall', 'normal'])?.id).toBe('s');
    expect(matchingTemplate(tpls, 75, ['wall', 'normal'])).toBeNull();
  });

  it('plán už nemá Zápis a vyhodnocení na konci', () => {
    const tl = planTimeline(['normal']);
    expect(tl.items.map((i) => i.kind)).toEqual(['round']);
    expect(tl.total).toBe(9);
  });
});

describe('pauzy v šabloně (9. 11. 2026): po disciplíně', () => {
  it('pauza po posledním kole disciplíny; po posledním kole tréninku ne; na jedno místo jen jedna', () => {
    const seq: DisciplineId[] = ['warmupPasses', 'warmupPasses', 'normal', 'lossTax'];
    expect(placeDisciplineBreaks(seq, [{ after: 'warmupPasses', min: 10 }])).toEqual([{ after: 2, min: 10 }]);
    expect(placeDisciplineBreaks(seq, [{ after: 'lossTax', min: 5 }])).toEqual([]);
    expect(placeDisciplineBreaks(seq, [{ after: 'wall', min: 5 }])).toEqual([]);
    expect(placeDisciplineBreaks(seq, [{ after: 'normal', min: 5 }, { after: 'warmupPasses', min: 10 }])).toEqual([{ after: 2, min: 10 }, { after: 3, min: 5 }]);
  });

  it('šablona s pauzou: odhad ji započítá, nový trénink i použití šablony ji převezmou; víc hráčů = pauza dál za cvičeními', () => {
    const tpl = { id: 'k', name: 'Krátký', durationMin: 60, selection: ['warmupPasses', 'normal'] as DisciplineId[], breaks: [{ after: 'warmupPasses' as DisciplineId, min: 10 }] };
    expect(templateTimeline(tpl, 8, 4).total).toBe(9 + 10 + 9);
    const t = newTraining('t', '2026-11-09', null, null, tpl);
    expect(t.breaks).toEqual({ afterDisciplines: [{ after: 'warmupPasses', min: 10 }] });
    expect(breaksOf({ ...t, attendees: ['a', 'b', 'c', 'd'] })).toEqual([{ after: 1, min: 10 }]);
    const many = { ...t, tables: 1 as const, attendees: Array.from({ length: 8 }, (_, i) => `p${i}`) };
    const more = { ...many, plan: manualPlan(['warmupPasses', 'normal'], 8, 1) };
    expect(more.plan.warmupPasses).toBe(4);
    expect(breaksOf(more)).toEqual([{ after: 4, min: 10 }]);
    expect(withTemplate({ ...t, breaks: [{ after: 1, min: 20 }] }, { ...tpl, breaks: undefined }).breaks).toEqual([]);
    expect(validateTemplates([{ ...tpl, breaks: [{ after: 'warmupPasses', min: 7 }] }], catalogMins())).toBe('Pauza v šabloně „Krátký“ musí být 5–30 min po 5.');
  });

  it('ruční úprava pauz v tréninku ze šablony je převezme jako vlastní (po N. kole)', () => {
    const t = { ...newTraining('t', '2026-11-09', null, null, { id: 'k', name: 'K', durationMin: 60, selection: ['warmupPasses', 'normal'], breaks: [{ after: 'warmupPasses', min: 15 }] }), attendees: ['a', 'b', 'c', 'd'] };
    expect(setBreakMin(t, 0, 20).breaks).toEqual([{ after: 1, min: 20 }]);
  });
});

describe('pořadí disciplín v šabloně (9. 11. 2026)', () => {
  it('pořadí kol podle šablony; kola stejné disciplíny za sebou; bez pořadí katalog', () => {
    expect(planSequence({ warmupPasses: 1, normal: 2, sim: 1 })).toEqual(['warmupPasses', 'normal', 'normal', 'sim']);
    expect(planSequence({ warmupPasses: 1, normal: 2, sim: 1 }, ['normal', 'sim', 'warmupPasses'])).toEqual(['normal', 'normal', 'sim', 'warmupPasses']);
  });

  it('disciplína mimo pořadí (přidaná v průvodci) se zařadí podle katalogu za nejbližší předchozí', () => {
    const order = orderedDisciplines(['normal', 'warmupPasses']);
    expect(order.slice(0, 4)).toEqual(['warmup', 'normal', 'warmupPasses', 'passWallLane']); // Rozcvička nemá v katalogu předchůdce → první
    expect(order.indexOf('lossTax')).toBeGreaterThan(order.indexOf('normal'));
    expect(new Set(order).size).toBe(order.length);
  });

  it('nový trénink a použití šablony převezmou pořadí; rozpis podle něj', () => {
    const tpl = { id: 'k', name: 'K', durationMin: 60, selection: ['normal', 'warmupPasses'] as DisciplineId[] };
    const t = { ...newTraining('t', '2026-11-09', null, null, tpl), attendees: ['a', 'b', 'c', 'd'] };
    expect(t.disciplineOrder).toEqual(['normal', 'warmupPasses']);
    expect(roundSequence({ ...t, plan: { normal: 1, warmupPasses: 1 } })).toEqual(['normal', 'warmupPasses']);
    expect(withTemplate({ ...t, disciplineOrder: null }, tpl).disciplineOrder).toEqual(['normal', 'warmupPasses']);
  });
});

describe('nastavení tréninku jako šablona (10. 11. 2026)', () => {
  afterEach(() => applyCatalog({}));
  const t = {
    ...newTraining('t', '2026-11-10', null, null, undefined),
    attendees: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    durationMin: 120,
    plan: { warmupPasses: 4, normal: 5, wall: 2, sim: 1 },
    disciplineOrder: ['warmupPasses', 'wall', 'normal', 'sim'] as DisciplineId[],
    breaks: [{ after: 4, min: 15 }, { after: 7, min: 5 }],
  };

  it('délka, výběr v pořadí, kola zápasů; pauzy po disciplínách (i ta uprostřed disciplíny)', () => {
    const tpl = templateFromTraining(t, 'x', '  Úterý  ');
    expect(tpl).toEqual({
      id: 'x',
      name: 'Úterý',
      durationMin: 120,
      selection: ['warmupPasses', 'wall', 'normal', 'sim'],
      rounds: { wall: 2, normal: 5 },
      // po 4. kole končí cvičení; po 7. kole je uprostřed Normálního legu → za Normální leg
      breaks: [{ after: 'warmupPasses', min: 15 }, { after: 'normal', min: 5 }],
    });
  });

  it('z uložené šablony vznikne stejný plán (cvičení podle hráčů)', () => {
    const tpl = templateFromTraining(t, 'x', 'Úterý');
    const again = withTemplate({ ...t, plan: {}, breaks: [] }, tpl);
    expect(again.plan).toMatchObject({ normal: 5, wall: 2, sim: 1 });
    // cvičení: ručně navýšená 4 kola se neukládají, šablona dá kola podle hráčů (8 hráčů, 4 stoly = 1)
    expect(planSequence(again.plan, again.disciplineOrder).slice(0, 4)).toEqual(['warmupPasses', 'wall', 'wall', 'normal']);
    expect(breaksOf(again)[0]).toEqual({ after: 1, min: 15 });
  });

  it('addTemplate: přidá na konec, výchozí zůstane; stejný název nebo moc kol = chyba', () => {
    const data: CatalogData = { templates: [{ id: 'd', name: 'Výchozí', durationMin: 180, selection: ['normal'] }] };
    const out = addTemplate(data, templateFromTraining(t, 'x', 'Úterý'));
    expect('error' in out).toBe(false);
    expect((out as CatalogData).templates!.map((x) => x.name)).toEqual(['Výchozí', 'Úterý']);
    expect((out as CatalogData).disciplines).toBeUndefined(); // délky kol beze změny
    expect(addTemplate(data, templateFromTraining(t, 'y', 'výchozí'))).toEqual({ error: 'Šablona „výchozí“ už existuje.' });
    expect(addTemplate(data, templateFromTraining({ ...t, plan: { normal: 25 } }, 'z', 'Dlouhá'))).toEqual({ error: 'Počet kol v šabloně „Dlouhá“ musí být 1–20 (párové po dvou).' });
  });
});
