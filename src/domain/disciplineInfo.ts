import type { ExplanationItem } from './content';
import { DISCIPLINES, discipline, placesOf, roundStep, type DisciplineDef, type Places } from './disciplines';
import { explanation } from './explain';
import { SIM_MIN_PLAYERS } from './plan';
import { soloMetric } from './solo';
import type { DisciplineId } from './types';

/** Stránka Disciplíny: co se nabízí (vyřazené ne), v pořadí rozpisu. */
export const offeredDisciplines = (): DisciplineDef[] => DISCIPLINES.filter((d) => !d.retired);

/** Vysvětlivky disciplíny – stejné jako nápověda kola v rozpisu (Start 0:3 navíc Daň za ztrátu). */
export function disciplineHelp(id: DisciplineId): ExplanationItem[] {
  const d = discipline(id);
  const out = [explanation(d.explain)];
  if (d.id === 'start03') out.push(explanation('Daň za ztrátu'));
  return out;
}

/** Obecná pravidla všech zápasových kol (v rozpisu sbalená pod nápovědou kola). */
export const MATCH_GENERAL_HELP: ExplanationItem[] = [explanation('Každý gól se počítá'), explanation('Role rozhodčího')];

/** Délka v řádku: kolik kol jde za sebou (párová / na dvě varianty = 2) a délka kola (aktuální katalog). */
export function disciplineDuration(id: DisciplineId): { rounds: 1 | 2; min: number } {
  const d = discipline(id);
  return { rounds: roundStep(d), min: d.min };
}

/** Párový zápas (ikona v řádku): 2 kola, strany si prohodí role. */
export function disciplineWho(id: DisciplineId): { icon: 'swap'; label: string } | null {
  return discipline(id).paired ? { icon: 'swap', label: '2 kola, strany si prohodí role' } : null;
}

/** Kde se disciplína hraje (12. 11. 2026): klubový trénink, vlastní trénink sám, vlastní trénink ve dvou. */
export const disciplinePlaces = (id: DisciplineId): Places => placesOf(discipline(id));

export const PLACE_LABEL: Record<keyof Places, string> = { club: 'klubový trénink', solo: 'vlastní trénink sám', duo: 'vlastní trénink ve dvou' };
export const PLACE_KEYS: (keyof Places)[] = ['club', 'solo', 'duo'];

/** „klubový trénink, vlastní trénink ve dvou“ */
export const placesText = (p: Places): string => PLACE_KEYS.filter((k) => p[k]).map((k) => PLACE_LABEL[k]).join(', ');

/** Podrobnosti v rozbaleném řádku – jen z definice disciplíny. */
export function disciplineFacts(id: DisciplineId): string[] {
  const d = discipline(id);
  const out: string[] = [];
  const m = d.metric ? soloMetric(d.metric) : null;
  if (d.variants) {
    const n = m?.max ?? 20;
    out.push(d.variants.every((v) => /^varianta \d$/.test(v)) ? `2 kola po ${n} pokusech, variantu si určí hráč` : `2 kola po ${n}: ${d.variants.join(' / ')}`);
  }
  if (m?.streak) out.push(`${m.streak} povedených po sobě na čas, nepovedený nuluje`);
  if (d.paired) out.push('2 kola, strany si prohodí role');
  if (d.needsPartner) out.push('s bránícím soupeřem');
  if (d.singlesOnly) out.push('jen singly');
  if (d.kind === 'sim') out.push(`od ${SIM_MIN_PLAYERS} hráčů`);
  out.push(`hraje se: ${placesText(placesOf(d))}`);
  return out;
}
