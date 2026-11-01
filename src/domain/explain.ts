import { EXPLANATIONS, type ExplanationItem } from './content';
import { discipline } from './disciplines';
import type { ScheduleRow } from './types';

const item = (name: string): ExplanationItem => {
  for (const g of EXPLANATIONS) {
    const it = g.items.find((i) => i.name === name);
    if (it) return it;
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
    out.main.push(item(def.explain));
    if (def.id === 'start03') out.main.push(item('Daň za ztrátu'));
    out.general.push(item('Každý gól se počítá'), item('Role rozhodčího'));
    return out;
  }
  if (match?.type === 'match') {
    if (match.match.block === 'sim') {
      out.main.push(item('Simulace ligového kola'));
    } else {
      out.main.push(item(ROUND_RULE[match.match.round - 1]));
      if (match.match.round === 5) out.main.push(item('Daň za ztrátu'));
      out.general.push(item('Každý gól se počítá'), item('Role rozhodčího'));
    }
    return out;
  }
  const group = row.cells.find((c) => c?.type === 'group');
  if (group?.type === 'group' && group.discipline) {
    // Konfigurovatelný trénink: všechny stoly dělají totéž cvičení → jedna nápověda.
    out.main.push(item(discipline(group.discipline).explain));
    return out;
  }
  row.cells.forEach((c, j) => {
    if (c?.type === 'group' && c.station) out.perTable[j] = item(c.station);
  });
  const metric = row.cells.find((c) => c?.type === 'group' && !c.station && c.metric);
  if (metric?.type === 'group') {
    if (metric.metric === 'chain') out.main.push(item('Řetězec (trénink jedniček)'));
    if (metric.metric === 'backRodsBuildUp') out.main.push(item('Rozehrávka ze zadních tyčí'));
  }
  return out;
}
