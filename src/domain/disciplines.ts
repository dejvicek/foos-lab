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
  /** Co disciplína trénuje (štítky dovedností, hlavní první). */
  skills?: Skill[];
}

/** PRD 4.6 – pořadí je i pořadím v rozpisu. */
export const DISCIPLINES: DisciplineDef[] = [
  { id: 'warmupPasses', kind: 'drill', name: 'Přihrávky na pětce', min: 8, explain: 'Přihrávky na pětce', metric: 'warmupPasses', needsPartner: true, skills: ['Přihrávka z pětky', 'Kontrola míče', 'Čtení soupeře'] },
  { id: 'passWallLane', kind: 'drill', name: 'Přihrávky ke zdi a po lajně', min: 4, explain: 'Přihrávky ke zdi a po lajně', metric: 'passWallLane', variants: ['ke zdi', 'po lajně'], optional: true, skills: ['Přihrávka z pětky'] },
  { id: 'fiveBarControl', kind: 'drill', name: 'Udržení míče na pětce', min: 8, explain: 'Udržení míče na pětce', metric: 'fiveBarControl', soloMetric: 'fiveBarSolo', skills: ['Kontrola míče', 'Přihrávka z pětky'] },
  { id: 'setShooting', kind: 'drill', name: 'Penalta z místa (20 střel)', min: 8, explain: 'Penalta z místa', metric: 'setShooting', needsPartner: true, retired: true, successor: 'penaltyKeeper' },
  { id: 'penaltyKeeper', kind: 'drill', name: 'Penalta z místa proti brankáři', min: 4, explain: 'Penalta z místa proti brankáři', metric: 'penaltyKeeper', variants: ['varianta 1', 'varianta 2'], needsPartner: true, skills: ['Střela z trojky', 'Obrana brankou a dvojkou', 'Čtení soupeře'] },
  { id: 'penaltySolo', kind: 'drill', name: 'Penalta z místa bez brankáře', min: 4, explain: 'Penalta z místa bez brankáře', metric: 'penaltySolo', variants: ['varianta 1', 'varianta 2'], optional: true, skills: ['Střela z trojky'] },
  { id: 'backShotKeeper', kind: 'drill', name: 'Střela z dvojky proti brankáři', min: 4, explain: 'Střela z dvojky proti brankáři', metric: 'backShotKeeper', variants: ['varianta 1', 'varianta 2'], needsPartner: true, optional: true, skills: ['Střela z dvojky', 'Obrana brankou a dvojkou'] },
  { id: 'backShotSolo', kind: 'drill', name: 'Střela z dvojky bez brankáře', min: 4, explain: 'Střela z dvojky bez brankáře', metric: 'backShotSolo', variants: ['varianta 1', 'varianta 2'], optional: true, skills: ['Střela z dvojky'] },
  { id: 'clearing', kind: 'drill', name: 'Clearing', min: 4, explain: 'Clearing', metric: 'clearing', variants: ['varianta 1', 'varianta 2'], needsPartner: true, optional: true, skills: ['Clearing'] },
  { id: 'looseBall', kind: 'drill', name: 'Zachycení volného míče', min: 4, explain: 'Zachycení volného míče', metric: 'looseBall', variants: ['po zdi', 'středem'], needsPartner: true, optional: true, skills: ['Zachycení volného míče', 'Kontrola míče'] },
  { id: 'backRodsBuildUp', kind: 'drill', name: 'Rozehrávka ze zadních tyčí', min: 8, explain: 'Rozehrávka ze zadních tyčí', metric: 'backRodsBuildUp', retired: true },
  { id: 'chain', kind: 'drill', name: 'Řetězec', min: 8, explain: 'Řetězec (trénink jedniček)', metric: 'chain', retired: true },
  { id: 'normal', kind: 'match', name: 'Normální leg', min: 8, explain: 'Normální leg', skills: ['Zápasová praxe'] },
  { id: 'lossTax', kind: 'match', name: 'Daň za ztrátu', min: 8, explain: 'Daň za ztrátu', lossTax: true, skills: ['Kontrola míče', 'Rozehrávka z dvojky', 'Clearing'] },
  { id: 'wall', kind: 'match', name: 'Zeď', min: 8, explain: 'Zeď', wall: true, paired: true, skills: ['Tempo a trpělivost', 'Čtení soupeře', 'Kontrola míče'] },
  { id: 'start03', kind: 'match', name: 'Start 0:3 + daň', min: 5, explain: 'Start 0:3', lossTax: true, start: [0, 3], paired: true, skills: ['Dotahování', 'Kontrola míče'] },
  { id: 'start44', kind: 'match', name: 'Start 4:4', min: 5, explain: 'Start 4:4', start: [4, 4], skills: ['Koncovky pod tlakem'] },
  { id: 'start45', kind: 'match', name: 'Start 4:5', min: 5, explain: 'Start 4:5', start: [4, 5], paired: true, optional: true, skills: ['Koncovky pod tlakem'] },
  { id: 'start55', kind: 'match', name: 'Start 5:5, o 2 góly, strop 10', min: 6, explain: 'Start 5:5, o 2 góly, strop 10', start: [5, 5], skills: ['Koncovky pod tlakem'] },
  { id: 'singles', kind: 'match', name: 'Jedničky', min: 8, explain: 'Normální leg', singlesOnly: true, skills: ['Zápasová praxe', 'Rozehrávka z dvojky', 'Obrana brankou a dvojkou'] },
  { id: 'sim', kind: 'sim', name: 'Simulace ligového kola', min: 40, explain: 'Simulace ligového kola', skills: ['Dvojice', 'Zápasová praxe', 'Koncovky pod tlakem'] },
];

export const discipline = (id: DisciplineId): DisciplineDef => DISCIPLINES.find((d) => d.id === id)!;
