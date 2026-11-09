/**
 * Katalog disciplín (9. 11. 2026): admin upravuje názvy, délky kol, volitelnost, štítky a nápovědy
 * disciplín a spravuje sadu štítků. V úložišti jsou jen rozdíly proti výchozím hodnotám z kódu.
 * Délka kola platí pro nové tréninky (a při úpravě nezahájeného) – trénink si ji uloží (roundMin).
 */
import { EXPLANATIONS, type ExplanationPart } from './content';
import { catalogMins, DEFAULT_DISCIPLINES, setDisciplines, type DisciplineDef, type DisciplineMins } from './disciplines';
import { setHelpOverrides } from './explain';
import { DEFAULT_SKILLS, setSkills, type Skill, type SkillDef } from './skills';
import { BREAK_OPTIONS, DEFAULT_DURATION, defaultMatchRounds, drillRoundsNeeded, DURATION_OPTIONS, manualPlan, planSequence, planTimeline, playablePlan, type Plan, type TimelineItem } from './plan';
import type { Breaks, DisciplineId, TemplateBreak } from './types';

export interface DisciplineEdit {
  name?: string;
  min?: number;
  optional?: boolean;
  skills?: Skill[];
  /** Odstavce nápovědy (stejné štítky Cíl / Provedení / … jako výchozí). U sdílené nápovědy jen u vlastníka. */
  help?: ExplanationPart[];
}

/** Šablona tréninku: délka a vybrané disciplíny; první šablona = výchozí pro nový trénink. */
export interface TrainingTemplate {
  id: string;
  name: string;
  durationMin: number;
  selection: DisciplineId[];
  /** Počet kol zápasů (jinak 1, párové 2); cvičení podle počtu hráčů, simulace 1. */
  rounds?: Plan;
  /** Pauzy po disciplínách. */
  breaks?: TemplateBreak[];
}

export interface CatalogData {
  disciplines?: Partial<Record<DisciplineId, DisciplineEdit>>;
  /** Šablony tréninku; chybí = jedna „Výchozí“ (nevolitelné disciplíny, 3:00). */
  templates?: TrainingTemplate[];
  /** Celá sada štítků, když ji admin upravil; chybí = výchozí. */
  skills?: SkillDef[];
}

export const MIN_ROUND = 1;
export const MAX_ROUND = 60;

const validMin = (m: unknown): m is number => typeof m === 'number' && Number.isInteger(m) && m >= MIN_ROUND && m <= MAX_ROUND;
const def0 = (id: DisciplineId) => DEFAULT_DISCIPLINES.find((d) => d.id === id)!;
const defaultHelp = (name: string): ExplanationPart[] => {
  for (const g of EXPLANATIONS) {
    const it = g.items.find((i) => i.name === name);
    if (it) return it.parts;
  }
  return [];
};

/** Kdo nápovědu vlastní: první disciplína se stejnou vysvětlivkou (Jedničky sdílí text s Normálním legem). */
export const helpOwner = (id: DisciplineId): DisciplineId => DEFAULT_DISCIPLINES.find((d) => d.explain === def0(id).explain)!.id;

export function resolveCatalog(data: CatalogData): { disciplines: DisciplineDef[]; skills: readonly SkillDef[]; help: Record<string, ExplanationPart[]> } {
  const skills = data.skills?.length ? data.skills : DEFAULT_SKILLS;
  const known = new Set(skills.map((s) => s.id));
  const help: Record<string, ExplanationPart[]> = {};
  const disciplines = DEFAULT_DISCIPLINES.map((d) => {
    const e = data.disciplines?.[d.id] ?? {};
    if (e.help?.length && helpOwner(d.id) === d.id) help[d.explain] = e.help;
    const name = e.name?.trim();
    return {
      ...d,
      ...(name ? { name } : {}),
      ...(validMin(e.min) ? { min: e.min } : {}),
      ...(typeof e.optional === 'boolean' ? { optional: e.optional } : {}),
      ...(d.skills || e.skills ? { skills: (e.skills ?? d.skills ?? []).filter((s) => known.has(s)) } : {}),
    };
  });
  return { disciplines, skills, help };
}

/** Šablony z katalogu; bez uložených jedna „Výchozí“ z nevolitelných disciplín. */
export function trainingTemplates(data: CatalogData): TrainingTemplate[] {
  if (data.templates?.length) return data.templates;
  const selection = resolveCatalog(data).disciplines.filter((d) => !d.retired && !d.optional).map((d) => d.id);
  return [{ id: 'default', name: 'Výchozí', durationMin: DEFAULT_DURATION, selection }];
}

let TEMPLATES: TrainingTemplate[] = trainingTemplates({});
/** Aktuální šablony (nastavuje applyCatalog); první je výchozí pro nový trénink. */
export const currentTemplates = (): TrainingTemplate[] => TEMPLATES;

/** Nastaví katalog jako aktuální (discipline(), SKILLS, explanation(), šablony). Prázdný = výchozí. */
export function applyCatalog(data: CatalogData | null | undefined): void {
  const c = resolveCatalog(data ?? {});
  setSkills(c.skills);
  setDisciplines(c.disciplines);
  setHelpOverrides(c.help);
  TEMPLATES = trainingTemplates(data ?? {});
}

/** Kola šablony pro daný počet hráčů a stolů – přesně podle šablony, nic se nedoplňuje (9. 11. 2026). */
export const templatePlan = (t: TrainingTemplate, players: number, tables: number): Plan => manualPlan(t.selection, players, tables, t.rounds);

/** Pauzy tréninku podle šablony: po disciplínách, nebo žádné. */
export const templateBreaks = (t: TrainingTemplate): Breaks => (t.breaks?.length ? { afterDisciplines: t.breaks.map((b) => ({ ...b })) } : []);

/** Časová osa šablony (kola v pořadí šablony, pauzy) pro daný počet hráčů a stolů. */
export function templateTimeline(t: TrainingTemplate, players: number, tables: number, mins: DisciplineMins = catalogMins()): { items: TimelineItem[]; total: number } {
  const plan = playablePlan(templatePlan(t, players, tables), players);
  return planTimeline(planSequence(plan, t.selection), templateBreaks(t), mins);
}

/** Kolik kol disciplína v šabloně má: cvičení podle hráčů a stolů (× 2 varianty), zápas podle šablony, simulace 1. */
export function templateRounds(id: DisciplineId, players: number, tables: number, rounds?: Plan): number {
  const d = DEFAULT_DISCIPLINES.find((x) => x.id === id)!;
  if (d.kind === 'drill') return drillRoundsNeeded(players, tables) * (d.variants ? 2 : 1);
  if (d.kind === 'match') return (rounds?.[id] ?? 0) > 0 ? rounds![id]! : defaultMatchRounds(id);
  return 1;
}

/** Šablona, které trénink odpovídá (stejná délka a výběr), jinak null. */
export function matchingTemplate(templates: TrainingTemplate[], durationMin: number, selection: DisciplineId[]): TrainingTemplate | null {
  const key = (xs: DisciplineId[]) => [...xs].sort().join();
  return templates.find((t) => t.durationMin === durationMin && key(t.selection) === key(selection)) ?? null;
}

/** Uloží šablony a délky kol (u disciplín jen rozdíly proti výchozím). */
export function saveTemplates(data: CatalogData, templates: TrainingTemplate[], mins: DisciplineMins): CatalogData {
  let out: CatalogData = { ...data, templates: templates.map((t) => ({ ...t, name: t.name.trim(), selection: [...t.selection] })) };
  for (const d of DEFAULT_DISCIPLINES) {
    const m = mins[d.id];
    if (m === undefined) continue;
    const { min: _, ...rest } = out.disciplines?.[d.id] ?? {};
    out = withEntry(out, d.id, m === d.min ? rest : { ...rest, min: m });
  }
  return out;
}

export function validateTemplates(templates: TrainingTemplate[], mins: DisciplineMins): string | null {
  if (!templates.length) return 'Musí zůstat aspoň jedna šablona.';
  const seen = new Set<string>();
  for (const t of templates) {
    const n = t.name.trim();
    if (!n) return 'Šablona musí mít název.';
    if (seen.has(n.toLocaleLowerCase('cs'))) return `Šablona „${n}“ už existuje.`;
    seen.add(n.toLocaleLowerCase('cs'));
    if (!t.selection.length) return `Šablona „${n}“ nemá žádnou disciplínu.`;
    if (!DURATION_OPTIONS.includes(t.durationMin)) return `Délka šablony „${n}“ musí být 1:00–4:00 po 15 min.`;
    for (const b of t.breaks ?? []) if (!BREAK_OPTIONS.includes(b.min)) return `Pauza v šabloně „${n}“ musí být 5–30 min po 5.`;
    for (const [id, k] of Object.entries(t.rounds ?? {}) as [DisciplineId, number][]) {
      const paired = defaultMatchRounds(id) === 2;
      if (!Number.isInteger(k) || k < 1 || k > 20 || (paired && k % 2)) return `Počet kol v šabloně „${n}“ musí být 1–20 (párové po dvou).`;
    }
  }
  for (const d of DEFAULT_DISCIPLINES) {
    const m = mins[d.id];
    if (m !== undefined && !validMin(m)) return `Délka kola musí být ${MIN_ROUND}–${MAX_ROUND} minut (${resolveCatalog({}).disciplines.find((x) => x.id === d.id)!.name}).`;
  }
  return null;
}

/** Formulář úpravy disciplíny – co admin edituje. */
export interface DisciplineForm {
  name: string;
  min: number;
  optional: boolean;
  skills: Skill[];
  help: ExplanationPart[];
}

/** Aktuální hodnoty disciplíny (výchozí + katalog) do formuláře. Nápověda je vlastníkova. */
export function catalogForm(id: DisciplineId, data: CatalogData = {}): DisciplineForm {
  const c = resolveCatalog(data);
  const d = c.disciplines.find((x) => x.id === id)!;
  return {
    name: d.name,
    min: d.min,
    optional: !!d.optional,
    skills: [...(d.skills ?? [])],
    help: (c.help[d.explain] ?? defaultHelp(d.explain)).map((p) => ({ ...p })),
  };
}

export function validateDisciplineForm(f: DisciplineForm): string | null {
  if (!f.name.trim()) return 'Název nesmí být prázdný.';
  if (!validMin(f.min)) return `Délka kola musí být ${MIN_ROUND}–${MAX_ROUND} minut.`;
  return null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function withEntry(data: CatalogData, id: DisciplineId, e: DisciplineEdit): CatalogData {
  const disciplines = { ...data.disciplines };
  if (Object.keys(e).length) disciplines[id] = e;
  else delete disciplines[id];
  const { disciplines: _, ...rest } = data;
  return Object.keys(disciplines).length ? { ...rest, disciplines } : rest;
}

/** Uloží formulář: u disciplíny jen rozdíly proti výchozím, nápovědu u vlastníka. */
export function saveDiscipline(data: CatalogData, id: DisciplineId, f: DisciplineForm): CatalogData {
  const d = def0(id);
  const e: DisciplineEdit = {};
  if (f.name.trim() !== d.name) e.name = f.name.trim();
  if (f.min !== d.min) e.min = f.min;
  if (f.optional !== !!d.optional) e.optional = f.optional;
  if (!same(f.skills, d.skills ?? [])) e.skills = [...f.skills];
  const owner = helpOwner(id);
  const { help: _ownHelp, ...ownRest } = owner === id ? {} : (data.disciplines?.[owner] ?? {});
  const help = same(f.help, defaultHelp(d.explain)) ? undefined : f.help.map((p) => ({ ...p }));
  if (owner === id) return withEntry(data, id, help ? { ...e, help } : e);
  return withEntry(withEntry(data, id, e), owner, help ? { ...ownRest, help } : ownRest);
}

/** Obnovit výchozí: smaže úpravy disciplíny (vlastní nápovědu taky; sdílenou u vlastníka nechá). */
export const resetDiscipline = (data: CatalogData, id: DisciplineId): CatalogData => withEntry(data, id, {});

/** Uloží sadu štítků; shodná s výchozí se neukládá. */
export function saveSkills(data: CatalogData, list: readonly SkillDef[]): CatalogData {
  const { skills: _, ...rest } = data;
  const clean = list.map((s) => ({ ...s, name: s.name.trim() }));
  return same(clean, DEFAULT_SKILLS) ? rest : { ...rest, skills: clean };
}

export function validateSkills(list: readonly SkillDef[]): string | null {
  const seen = new Set<string>();
  for (const s of list) {
    const n = s.name.trim();
    if (!n) return 'Štítek musí mít název.';
    const k = n.toLocaleLowerCase('cs');
    if (seen.has(k)) return `Štítek „${n}“ už existuje.`;
    seen.add(k);
  }
  return null;
}
