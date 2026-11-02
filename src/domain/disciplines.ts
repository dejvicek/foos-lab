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
}

/** PRD 4.6 – pořadí je i pořadím v rozpisu. */
export const DISCIPLINES: DisciplineDef[] = [
  { id: 'warmupPasses', kind: 'drill', name: 'Přihrávky na pětce', min: 8, explain: 'Přihrávky na pětce', metric: 'warmupPasses' },
  { id: 'fiveBarControl', kind: 'drill', name: 'Udržení míče na pětce', min: 8, explain: 'Udržení míče na pětce', metric: 'fiveBarControl' },
  { id: 'setShooting', kind: 'drill', name: 'Penalta z místa', min: 8, explain: 'Penalta z místa', metric: 'setShooting' },
  { id: 'blockToControl', kind: 'drill', name: 'Obrana do držení', min: 8, explain: 'Obrana do držení', metric: 'blockToControl' },
  { id: 'backRodsBuildUp', kind: 'drill', name: 'Rozehrávka ze zadních tyčí', min: 8, explain: 'Rozehrávka ze zadních tyčí', metric: 'backRodsBuildUp', retired: true },
  { id: 'chain', kind: 'drill', name: 'Řetězec', min: 8, explain: 'Řetězec (trénink jedniček)', metric: 'chain', retired: true },
  { id: 'normal', kind: 'match', name: 'Normální leg', min: 8, explain: 'Normální leg' },
  { id: 'lossTax', kind: 'match', name: 'Daň za ztrátu', min: 8, explain: 'Daň za ztrátu', lossTax: true },
  { id: 'wall', kind: 'match', name: 'Zeď', min: 8, explain: 'Zeď', wall: true, paired: true },
  { id: 'start03', kind: 'match', name: 'Start 0:3 + daň', min: 5, explain: 'Start 0:3', lossTax: true, start: [0, 3], paired: true },
  { id: 'start44', kind: 'match', name: 'Start 4:4', min: 3, explain: 'Start 4:4', start: [4, 4] },
  { id: 'start55', kind: 'match', name: 'Start 5:5, o 2 góly, strop 10', min: 3, explain: 'Start 5:5, o 2 góly, strop 10', start: [5, 5] },
  { id: 'singles', kind: 'match', name: 'Jedničky', min: 8, explain: 'Normální leg', singlesOnly: true },
  { id: 'sim', kind: 'sim', name: 'Simulace ligového kola', min: 40, explain: 'Simulace ligového kola' },
];

export const discipline = (id: DisciplineId): DisciplineDef => DISCIPLINES.find((d) => d.id === id)!;
