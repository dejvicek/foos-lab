import type { PlayerId, Schedule, SoloKey, SoloMetric } from './types';

export interface SoloMetricDef {
  id: SoloMetric;
  name: string;
  /** Co se zapisuje, např. „ztráty z 10 sérií“. */
  what: string;
  /** Plný počet pokusů; u cvičení na čas (streak) jen pojistka, kolik pokusů jde zapsat. */
  max: number;
  lowerIsBetter: boolean;
  /** Tlačítka po pokusu (PRD 5.8): povedený / nepovedený. */
  ok: string;
  fail: string;
  /**
   * Cvičení na čas (Čistá desítka, 11. 11. 2026): kolik povedených pokusů po sobě. Výsledek je čas
   * v sekundách od začátku kola do posledního z nich (0 = ještě nesplněno); nepovedený nuluje sérii.
   */
  streak?: number;
}

/** Kolik povedených po sobě chce Čistá desítka. */
export const STREAK_LENGTH = 10;
/** Pojistka počtu pokusů cvičení na čas (databáze víc nepřičte). */
export const STREAK_CAP = 500;

const streakDef = (id: SoloMetric, name: string, ok: string, fail: string): SoloMetricDef => ({
  id, name, what: `čas do ${STREAK_LENGTH} povedených po sobě`, max: STREAK_CAP, lowerIsBetter: true, ok, fail, streak: STREAK_LENGTH,
});

/** Cvičení na čas (výsledek = sekundy do splnění série)? */
export const isStreak = (def: Pick<SoloMetricDef, 'streak'>): boolean => !!def.streak;

/**
 * PRD 5.8 – pořadí určuje i pořadí tabulek v žebříčku stanovišť. Od 11. 11. 2026 má každé cvičení
 * 20 pokusů (dřív 10; starší výsledky si nesou svůj počet pokusů, migrace 27).
 */
export const SOLO_METRICS: SoloMetricDef[] = [
  { id: 'warmupPasses', name: 'Přihrávky na pětce', what: 'povedené přihrávky z 20', max: 20, lowerIsBetter: false, ok: 'povedená', fail: 'nepovedená' },
  { id: 'passWallLane', name: 'Přihrávky ke zdi a po lajně', what: 'povedené přihrávky z 20', max: 20, lowerIsBetter: false, ok: 'povedená', fail: 'nepovedená' },
  // Udržení míče na pětce (12. 11. 2026): počítají se góly, víc je lépe (dřív ztráty; migrace 29 převedla výsledky).
  { id: 'fiveBarControl', name: 'Udržení míče na pětce', what: 'góly z 20 sérií', max: 20, lowerIsBetter: false, ok: 'gól', fail: 'bez gólu' },
  { id: 'fiveBarSolo', name: 'Udržení míče na pětce – sólo', what: 'góly z 20 sérií', max: 20, lowerIsBetter: false, ok: 'gól', fail: 'bez gólu' },
  { id: 'setShooting', name: 'Penalta z místa (20 střel)', what: 'góly z 20 střel', max: 20, lowerIsBetter: false, ok: 'gól', fail: 'vedle' },
  { id: 'penaltyKeeper', name: 'Penalta z místa proti brankáři', what: 'góly z 20 střel', max: 20, lowerIsBetter: false, ok: 'gól', fail: 'bez gólu' },
  { id: 'penaltySolo', name: 'Penalta z místa bez brankáře', what: 'góly z 20 střel', max: 20, lowerIsBetter: false, ok: 'gól', fail: 'vedle' },
  { id: 'backShotKeeper', name: 'Střela z dvojky proti brankáři', what: 'góly z 20 střel', max: 20, lowerIsBetter: false, ok: 'gól', fail: 'bez gólu' },
  { id: 'backShotSolo', name: 'Střela z dvojky bez brankáře', what: 'góly z 20 střel', max: 20, lowerIsBetter: false, ok: 'gól', fail: 'vedle' },
  { id: 'clearing', name: 'Clearing', what: 'míče za pětku z 20', max: 20, lowerIsBetter: false, ok: 'za pětkou', fail: 'zachycený' },
  { id: 'looseBall', name: 'Zachycení volného míče', what: 'míče pod kontrolou z 20', max: 20, lowerIsBetter: false, ok: 'pod kontrolou', fail: 'nezachycený' },
  // Vyřazená: zůstává po 10 kvůli historii.
  { id: 'backRodsBuildUp', name: 'Rozehrávka ze zadních tyčí', what: 'dokončené rozehrávky z 10', max: 10, lowerIsBetter: false, ok: 'dokončená', fail: 'nedokončená' },
  { id: 'chain', name: 'Řetězec', what: 'góly z 20', max: 20, lowerIsBetter: false, ok: 'gól', fail: 'bez gólu' },
  streakDef('streakShot3', 'Čistá desítka – střela z trojky', 'gól', 'vedle'),
  streakDef('streakPass5', 'Čistá desítka – přihrávka na pětce', 'povedená', 'nepovedená'),
  streakDef('streakShot2', 'Čistá desítka – střela z dvojky', 'gól', 'vedle'),
  streakDef('streakPass2', 'Čistá desítka – přihrávka z dvojky', 'povedená', 'nepovedená'),
];

/** Metrika stanoviště na stole j (pořadí STATIONS v content.ts) – jen starší klasické tréninky. */
export const STATION_METRICS: SoloMetric[] = ['fiveBarControl', 'setShooting', 'backRodsBuildUp'];

export const soloMetric = (id: SoloMetric): SoloMetricDef => SOLO_METRICS.find((m) => m.id === id)!;

export interface SoloSlot {
  metric: SoloMetric;
  playerId: PlayerId;
  key: SoloKey;
}

export const soloKey = (metric: SoloMetric, round?: number): SoloKey => (round ? `${metric}@${round}` : metric);

export function parseSoloKey(key: SoloKey): { metric: SoloMetric; round: number } {
  const [m, r] = key.split('@');
  return { metric: m as SoloMetric, round: r ? Number(r) : 0 };
}

/** Všechna místa, kde se v rozpisu zapisuje výsledek sólové části (hráč × metrika). */
export function soloSlots(s: Schedule): SoloSlot[] {
  const out: SoloSlot[] = [];
  for (const sec of s.sections)
    for (const row of sec.rows)
      for (const c of row.cells)
        if (c?.type === 'group' && c.metric)
          for (const p of c.players) out.push({ metric: c.metric, playerId: p, key: soloKey(c.metric, c.soloRound) });
  return out;
}

export const DEFAULT_START = '18:00';

/** Skutečný čas: začátek + offset v minutách, přes půlnoc modulo 24 h. */
export function clockAt(startTime: string, offsetMin: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const total = (((h * 60 + m + offsetMin) % 1440) + 1440) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${hh}:${mm < 10 ? '0' : ''}${mm}`;
}
