import { EXPLANATIONS, type ExplanationItem, type ExplanationPart } from './content';
import { DEFAULT_DISCIPLINES, discipline, DISCIPLINES } from './disciplines';
import type { ScheduleRow } from './types';

/** Texty nápověd upravené v katalogu (podle názvu vysvětlivky; nastavuje applyCatalog). */
let HELP_OVERRIDES: Record<string, ExplanationPart[]> = {};

export function setHelpOverrides(h: Record<string, ExplanationPart[]>): void {
  HELP_OVERRIDES = h;
}

/** Nadpis vysvětlivky: když admin disciplínu s touto vysvětlivkou přejmenoval, její nový název; jinak název vysvětlivky. */
export function explanationTitle(name: string): string {
  const d = DISCIPLINES.find((x) => x.explain === name);
  const renamed = d && d.name !== DEFAULT_DISCIPLINES.find((x) => x.id === d.id)!.name;
  return renamed ? d.name : name;
}

/** Vysvětlivka podle názvu (content.ts, případně s textem z katalogu). */
export const explanation = (name: string): ExplanationItem => {
  for (const g of EXPLANATIONS) {
    const it = g.items.find((i) => i.name === name);
    if (it) return HELP_OVERRIDES[name] ? { ...it, parts: HELP_OVERRIDES[name] } : it;
  }
  throw new Error(`Chybí vysvětlivka „${name}“`);
};

/** Pravidlo podle čísla kola scénářové ligy (1–7). */
const ROUND_RULE = ['Normální leg', 'Daň za ztrátu', 'Zeď', 'Zeď', 'Start 0:3', 'Start 4:4', 'Start 5:5, o 2 góly, strop 10'];

export interface BlockExplanations {
  /** Texty k celému bloku (pravidlo kola, řetězec, …). */
  main: ExplanationItem[];
  /** Obecná pravidla, zobrazují se sbaleně. */
  general: ExplanationItem[];
  /** Vysvětlivka ke každému stolu (stanoviště), index = stůl − 1. */
  perTable: (ExplanationItem | null)[];
}

/** Které vysvětlivky (PRD 4.4–4.5) patří k danému bloku rozpisu. */
export function explanationsFor(row: ScheduleRow): BlockExplanations {
  const out: BlockExplanations = { main: [], general: [], perTable: row.cells.map(() => null) };
  const match = row.cells.find((c) => c?.type === 'match');
  if (match?.type === 'match' && match.match.discipline && match.match.block !== 'sim') {
    const def = discipline(match.match.discipline);
    out.main.push(explanation(def.explain));
    if (def.id === 'start03') out.main.push(explanation('Daň za ztrátu'));
    out.general.push(explanation('Každý gól se počítá'), explanation('Role rozhodčího'));
    return out;
  }
  if (match?.type === 'match') {
    if (match.match.block === 'sim') {
      out.main.push(explanation('Simulace ligového kola'));
    } else {
      out.main.push(explanation(ROUND_RULE[match.match.round - 1]));
      if (match.match.round === 5) out.main.push(explanation('Daň za ztrátu'));
      out.general.push(explanation('Každý gól se počítá'), explanation('Role rozhodčího'));
    }
    return out;
  }
  const group = row.cells.find((c) => c?.type === 'group');
  if (group?.type === 'group' && group.discipline) {
    // Konfigurovatelný trénink: všechny stoly dělají totéž cvičení → jedna nápověda.
    out.main.push(explanation(discipline(group.discipline).explain));
    return out;
  }
  row.cells.forEach((c, j) => {
    if (c?.type === 'group' && c.station) out.perTable[j] = explanation(c.station);
  });
  const metric = row.cells.find((c) => c?.type === 'group' && !c.station && c.metric);
  if (metric?.type === 'group') {
    if (metric.metric === 'chain') out.main.push(explanation('Řetězec (trénink jedniček)'));
    if (metric.metric === 'backRodsBuildUp') out.main.push(explanation('Rozehrávka ze zadních tyčí'));
  }
  return out;
}
