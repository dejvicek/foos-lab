import type { ExplanationItem } from './content';
import { DISCIPLINES, discipline, roundStep, type DisciplineDef } from './disciplines';
import { explanation } from './explain';
import { SIM_MIN_PLAYERS } from './plan';
import { soloMetric } from './solo';
import { practiceDrills } from './practice';
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

/** Kdo hraje (ikona v řádku): cvičení s bránícím soupeřem / sám, párový zápas s prohozením stran. */
export function disciplineWho(id: DisciplineId): { icon: 'pair' | 'solo' | 'swap'; label: string } | null {
  const d = discipline(id);
  if (d.kind === 'drill') return d.needsPartner ? { icon: 'pair', label: 's bránícím soupeřem' } : { icon: 'solo', label: 'jde i sám' };
  if (d.paired) return { icon: 'swap', label: '2 kola, strany si prohodí role' };
  return null;
}

/**
 * Kde se disciplína hraje (12. 11. 2026): jen ve vlastním tréninku (Čistá desítka), jen v klubovém
 * (co vlastní trénink pro 1–2 hráče nenabízí – simulace), jinak v obou (null).
 */
export function disciplineScope(id: DisciplineId): 'practice' | 'club' | null {
  const d = discipline(id);
  if (d.practiceOnly) return 'practice';
  return practiceDrills(2).some((x) => x.id === id) ? null : 'club';
}

export const SCOPE_LABEL = { practice: 'jen vlastní trénink', club: 'jen klubový trénink' } as const;

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
  if (d.kind === 'drill') out.push(d.needsPartner ? 's bránícím soupeřem' : 'jde i sám');
  if (d.singlesOnly) out.push('jen singly');
  if (d.kind === 'sim') out.push(`od ${SIM_MIN_PLAYERS} hráčů`);
  return out;
}
