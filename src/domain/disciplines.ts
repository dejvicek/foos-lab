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
  /** Nabízí se, ale ve výchozím výběru nového tréninku není (zaškrtne se ručně). */
  optional?: boolean;
  /** Cvičení na dvě varianty: kola po dvou (stejné skupiny), v každém jedna varianta po 10 pokusech. */
  variants?: [string, string];
  /** Cvičení s bránícím soupeřem – sám ho hráč hrát nemůže (trénink pro 1 hráče ho vynechá). */
  needsPartner?: boolean;
  /** Metrika, když je hráč u stolu sám (sólo varianta do vlastní tabulky žebříčku). */
  soloMetric?: SoloMetric;
  /** Vyřazená disciplína: čím ji nahradit v novém tréninku. */
  successor?: DisciplineId;
}

/** PRD 4.6 – pořadí je i pořadím v rozpisu. */
export const DISCIPLINES: DisciplineDef[] = [
  { id: 'warmupPasses', kind: 'drill', name: 'Přihrávky na pětce', min: 8, explain: 'Přihrávky na pětce', metric: 'warmupPasses', needsPartner: true },
  { id: 'passWallLane', kind: 'drill', name: 'Přihrávky ke zdi a po lajně', min: 4, explain: 'Přihrávky ke zdi a po lajně', metric: 'passWallLane', variants: ['ke zdi', 'po lajně'], optional: true },
  { id: 'fiveBarControl', kind: 'drill', name: 'Udržení míče na pětce', min: 8, explain: 'Udržení míče na pětce', metric: 'fiveBarControl', soloMetric: 'fiveBarSolo' },
  { id: 'setShooting', kind: 'drill', name: 'Penalta z místa (20 střel)', min: 8, explain: 'Penalta z místa', metric: 'setShooting', needsPartner: true, retired: true, successor: 'penaltyKeeper' },
  { id: 'penaltyKeeper', kind: 'drill', name: 'Penalta z místa proti brankáři', min: 4, explain: 'Penalta z místa proti brankáři', metric: 'penaltyKeeper', variants: ['varianta 1', 'varianta 2'], needsPartner: true },
  { id: 'penaltySolo', kind: 'drill', name: 'Penalta z místa bez brankáře', min: 4, explain: 'Penalta z místa bez brankáře', metric: 'penaltySolo', variants: ['varianta 1', 'varianta 2'], optional: true },
  { id: 'backShotKeeper', kind: 'drill', name: 'Střela z dvojky proti brankáři', min: 4, explain: 'Střela z dvojky proti brankáři', metric: 'backShotKeeper', variants: ['varianta 1', 'varianta 2'], needsPartner: true, optional: true },
  { id: 'backShotSolo', kind: 'drill', name: 'Střela z dvojky bez brankáře', min: 4, explain: 'Střela z dvojky bez brankáře', metric: 'backShotSolo', variants: ['varianta 1', 'varianta 2'], optional: true },
  { id: 'blockToControl', kind: 'drill', name: 'Obrana do držení', min: 8, explain: 'Obrana do držení', metric: 'blockToControl', needsPartner: true },
  { id: 'clearing', kind: 'drill', name: 'Clearing', min: 4, explain: 'Clearing', metric: 'clearing', variants: ['varianta 1', 'varianta 2'], needsPartner: true, optional: true },
  { id: 'looseBall', kind: 'drill', name: 'Zachycení volného míče', min: 4, explain: 'Zachycení volného míče', metric: 'looseBall', variants: ['po zdi', 'středem'], needsPartner: true, optional: true },
  { id: 'backRodsBuildUp', kind: 'drill', name: 'Rozehrávka ze zadních tyčí', min: 8, explain: 'Rozehrávka ze zadních tyčí', metric: 'backRodsBuildUp', retired: true },
  { id: 'chain', kind: 'drill', name: 'Řetězec', min: 8, explain: 'Řetězec (trénink jedniček)', metric: 'chain', retired: true },
  { id: 'normal', kind: 'match', name: 'Normální leg', min: 8, explain: 'Normální leg' },
  { id: 'lossTax', kind: 'match', name: 'Daň za ztrátu', min: 8, explain: 'Daň za ztrátu', lossTax: true },
  { id: 'wall', kind: 'match', name: 'Zeď', min: 8, explain: 'Zeď', wall: true, paired: true },
  { id: 'start03', kind: 'match', name: 'Start 0:3 + daň', min: 5, explain: 'Start 0:3', lossTax: true, start: [0, 3], paired: true },
  { id: 'start44', kind: 'match', name: 'Start 4:4', min: 5, explain: 'Start 4:4', start: [4, 4] },
  { id: 'start45', kind: 'match', name: 'Start 4:5', min: 5, explain: 'Start 4:5', start: [4, 5], paired: true, optional: true },
  { id: 'start55', kind: 'match', name: 'Start 5:5, o 2 góly, strop 10', min: 6, explain: 'Start 5:5, o 2 góly, strop 10', start: [5, 5] },
  { id: 'singles', kind: 'match', name: 'Jedničky', min: 8, explain: 'Normální leg', singlesOnly: true },
  { id: 'sim', kind: 'sim', name: 'Simulace ligového kola', min: 40, explain: 'Simulace ligového kola' },
];

export const discipline = (id: DisciplineId): DisciplineDef => DISCIPLINES.find((d) => d.id === id)!;
