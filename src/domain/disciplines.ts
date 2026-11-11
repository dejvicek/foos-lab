import type { Skill } from './skills';
import type { DisciplineId, SoloMetric } from './types';

export type { DisciplineId };

export interface DisciplineDef {
  id: DisciplineId;
  kind: 'drill' | 'match' | 'sim';
  name: string;
  /** Délka kola v minutách (bez přechodu). */
  min: number;
  /** Název položky ve vysvětlivkách (content.ts). */
  explain: string;
  metric?: SoloMetric;
  lossTax?: boolean;
  wall?: boolean;
  start?: [number, number];
  singlesOnly?: boolean;
  /** Asymetrická disciplína (Zeď, Start 0:3): kola po dvou, ve druhém si strany role prohodí. */
  paired?: boolean;
  /** Vyřazená (už se nenabízí); zůstává kvůli starším tréninkům a historii. */
  retired?: boolean;
  /** Cvičení na dvě varianty: kola po dvou (stejné skupiny), v každém jedna varianta po 20 pokusech. */
  variants?: [string, string];
  /** Cvičení s bránícím soupeřem – sám ho hráč hrát nemůže (trénink pro 1 hráče ho vynechá). */
  needsPartner?: boolean;
  /** Metrika, když je hráč u stolu sám (sólo varianta do vlastní tabulky žebříčku). */
  soloMetric?: SoloMetric;
  /** Vyřazená disciplína: čím ji nahradit v novém tréninku. */
  successor?: DisciplineId;
  /** Co disciplína trénuje (štítky dovedností, hlavní první). */
  skills?: Skill[];
  /** Každý hráč cvičí sám na své straně: u stolu nejvýš 2, lichý sám u volného stolu, bez sparing partnera. */
  individual?: boolean;
}

/** PRD 4.6 – pořadí je i pořadím v rozpisu. Výchozí hodnoty; admin je upravuje v katalogu (catalog.ts). */
export const DEFAULT_DISCIPLINES: readonly DisciplineDef[] = [
  { id: 'warmup', kind: 'drill', name: 'Rozcvička', min: 9, explain: 'Rozcvička', individual: true, skills: ['control', 'pass5'] },
  { id: 'warmupPasses', kind: 'drill', name: 'Přihrávky na pětce', min: 8, explain: 'Přihrávky na pětce', metric: 'warmupPasses', needsPartner: true, skills: ['pass5', 'control', 'reading'] },
  { id: 'passWallLane', kind: 'drill', name: 'Přihrávky ke zdi a po lajně', min: 8, explain: 'Přihrávky ke zdi a po lajně', metric: 'passWallLane', variants: ['ke zdi', 'po lajně'], skills: ['pass5'] },
  { id: 'fiveBarControl', kind: 'drill', name: 'Udržení míče na pětce', min: 16, explain: 'Udržení míče na pětce', metric: 'fiveBarControl', soloMetric: 'fiveBarSolo', skills: ['control', 'pass5'] },
  { id: 'setShooting', kind: 'drill', name: 'Penalta z místa (20 střel)', min: 8, explain: 'Penalta z místa', metric: 'setShooting', needsPartner: true, retired: true, successor: 'penaltyKeeper' },
  { id: 'penaltyKeeper', kind: 'drill', name: 'Penalta z místa proti brankáři', min: 8, explain: 'Penalta z místa proti brankáři', metric: 'penaltyKeeper', variants: ['varianta 1', 'varianta 2'], needsPartner: true, skills: ['shot3', 'defense', 'reading'] },
  { id: 'penaltySolo', kind: 'drill', name: 'Penalta z místa bez brankáře', min: 8, explain: 'Penalta z místa bez brankáře', metric: 'penaltySolo', variants: ['varianta 1', 'varianta 2'], skills: ['shot3'] },
  { id: 'backShotKeeper', kind: 'drill', name: 'Střela z dvojky proti brankáři', min: 8, explain: 'Střela z dvojky proti brankáři', metric: 'backShotKeeper', variants: ['varianta 1', 'varianta 2'], needsPartner: true, skills: ['shot2', 'defense'] },
  { id: 'backShotSolo', kind: 'drill', name: 'Střela z dvojky bez brankáře', min: 8, explain: 'Střela z dvojky bez brankáře', metric: 'backShotSolo', variants: ['varianta 1', 'varianta 2'], skills: ['shot2'] },
  { id: 'clearing', kind: 'drill', name: 'Clearing', min: 8, explain: 'Clearing', metric: 'clearing', variants: ['varianta 1', 'varianta 2'], needsPartner: true, skills: ['clearing'] },
  { id: 'looseBall', kind: 'drill', name: 'Zachycení volného míče', min: 8, explain: 'Zachycení volného míče', metric: 'looseBall', variants: ['po zdi', 'středem'], needsPartner: true, skills: ['looseBall', 'control'] },
  { id: 'backRodsBuildUp', kind: 'drill', name: 'Rozehrávka ze zadních tyčí', min: 8, explain: 'Rozehrávka ze zadních tyčí', metric: 'backRodsBuildUp', retired: true },
  // Řetězec znovu (10. 11. 2026): z dvojky přes pětku a trojku do gólu; kolo 8 min, ve dvojici se střídají, každý 20 pokusů.
  { id: 'chain', kind: 'drill', name: 'Řetězec', min: 8, explain: 'Řetězec', metric: 'chain', needsPartner: true, skills: ['buildUp2', 'pass5', 'shot3'] },
  // Čistá desítka (11. 11. 2026): 10 povedených stejných pokusů po sobě na čas; každý sám na své straně.
  { id: 'streakShot3', kind: 'drill', name: 'Čistá desítka – střela z trojky', min: 10, explain: 'Čistá desítka – střela z trojky', metric: 'streakShot3', individual: true, skills: ['shot3'] },
  { id: 'streakPass5', kind: 'drill', name: 'Čistá desítka – přihrávka na pětce', min: 10, explain: 'Čistá desítka – přihrávka na pětce', metric: 'streakPass5', individual: true, skills: ['pass5'] },
  { id: 'streakShot2', kind: 'drill', name: 'Čistá desítka – střela z dvojky', min: 10, explain: 'Čistá desítka – střela z dvojky', metric: 'streakShot2', individual: true, skills: ['shot2'] },
  { id: 'streakPass2', kind: 'drill', name: 'Čistá desítka – přihrávka z dvojky', min: 10, explain: 'Čistá desítka – přihrávka z dvojky', metric: 'streakPass2', individual: true, skills: ['buildUp2'] },
  { id: 'normal', kind: 'match', name: 'Normální leg', min: 8, explain: 'Normální leg', skills: ['matchPlay'] },
  { id: 'lossTax', kind: 'match', name: 'Daň za ztrátu', min: 8, explain: 'Daň za ztrátu', lossTax: true, skills: ['control', 'buildUp2', 'clearing'] },
  { id: 'wall', kind: 'match', name: 'Zeď', min: 8, explain: 'Zeď', wall: true, paired: true, skills: ['tempo', 'reading', 'control'] },
  { id: 'start03', kind: 'match', name: 'Start 0:3 + daň', min: 5, explain: 'Start 0:3', lossTax: true, start: [0, 3], paired: true, skills: ['comeback', 'control'] },
  { id: 'start44', kind: 'match', name: 'Start 4:4', min: 5, explain: 'Start 4:4', start: [4, 4], skills: ['clutch'] },
  { id: 'start45', kind: 'match', name: 'Start 4:5', min: 5, explain: 'Start 4:5', start: [4, 5], paired: true, skills: ['clutch'] },
  { id: 'start55', kind: 'match', name: 'Start 5:5, o 2 góly, strop 10', min: 6, explain: 'Start 5:5, o 2 góly, strop 10', start: [5, 5], skills: ['clutch'] },
  { id: 'singles', kind: 'match', name: 'Jedničky', min: 8, explain: 'Normální leg', singlesOnly: true, skills: ['matchPlay', 'buildUp2', 'defense'] },
  { id: 'sim', kind: 'sim', name: 'Simulace ligového kola', min: 40, explain: 'Simulace ligového kola', skills: ['doubles', 'matchPlay', 'clutch'] },
];

/** Aktuální disciplíny: výchozí + úpravy z katalogu (nastavuje applyCatalog). `min` je délka kola pro nové tréninky. */
/** Cvičení po dvou kolech ve stejných skupinách (na dvě varianty). */
export const drillInPairs = (d: DisciplineDef): boolean => d.kind === 'drill' && !!d.variants;

/** Krok počtu kol: párové zápasy a cvičení po dvou kolech po 2, jinak po 1. */
export const roundStep = (d: DisciplineDef): 1 | 2 => (d.paired || drillInPairs(d) ? 2 : 1);

export let DISCIPLINES: readonly DisciplineDef[] = DEFAULT_DISCIPLINES;

export function setDisciplines(list: readonly DisciplineDef[]): void {
  DISCIPLINES = list;
}

export const discipline = (id: DisciplineId): DisciplineDef => DISCIPLINES.find((d) => d.id === id)!;

/** Délky kol uložené v tréninku (snímek katalogu při založení / úpravě). */
export type DisciplineMins = Partial<Record<DisciplineId, number>>;

/**
 * Délka kola disciplíny v daném tréninku: snímek z tréninku; trénink bez snímku (založený
 * před katalogem, 9. 11. 2026) má výchozí délky z kódu – jeho časy se změnou katalogu nehnou.
 */
export const roundMin = (id: DisciplineId, mins?: DisciplineMins | null): number =>
  mins?.[id] ?? MIN_BEFORE_20[id] ?? DEFAULT_DISCIPLINES.find((d) => d.id === id)!.min;

/**
 * Výchozí délky kol cvičení před 20 pokusy (11. 11. 2026 se zdvojnásobily). Platí pro tréninky bez
 * snímku délek – ty vznikly dřív, takže jejich časy zůstanou.
 */
const MIN_BEFORE_20: DisciplineMins = {
  passWallLane: 4, fiveBarControl: 8, penaltyKeeper: 4, penaltySolo: 4, backShotKeeper: 4, backShotSolo: 4, clearing: 4, looseBall: 4,
};

/** Snímek aktuálních délek kol (nabízených disciplín) – ukládá se do nového / upraveného tréninku. */
export const catalogMins = (): DisciplineMins => Object.fromEntries(DISCIPLINES.filter((d) => !d.retired).map((d) => [d.id, d.min]));
