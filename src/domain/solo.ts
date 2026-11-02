import type { PlayerId, Schedule, SoloKey, SoloMetric } from './types';

export interface SoloMetricDef {
  id: SoloMetric;
  name: string;
  /** Co se zapisuje, např. „ztráty z 10 sérií“. */
  what: string;
  max: number;
  lowerIsBetter: boolean;
  /** Tlačítka po pokusu (PRD 5.8): povedený / nepovedený. */
  ok: string;
  fail: string;
}

/** PRD 5.8 – pořadí určuje i pořadí tabulek v žebříčku stanovišť. */
export const SOLO_METRICS: SoloMetricDef[] = [
  { id: 'warmupPasses', name: 'Přihrávky na pětce', what: 'povedené přihrávky z 20', max: 20, lowerIsBetter: false, ok: 'povedená', fail: 'nepovedená' },
  { id: 'fiveBarControl', name: 'Udržení míče na pětce', what: 'ztráty z 10 sérií', max: 10, lowerIsBetter: true, ok: 'bez ztráty', fail: 'ztráta' },
  { id: 'setShooting', name: 'Střelba jen z nastavení', what: 'góly z 20 střel', max: 20, lowerIsBetter: false, ok: 'gól', fail: 'vedle' },
  { id: 'blockToControl', name: 'Obrana do držení', what: 'bloky do držení z 10', max: 10, lowerIsBetter: false, ok: 'do držení', fail: 'nechytil' },
  { id: 'backRodsBuildUp', name: 'Rozehrávka ze zadních tyčí', what: 'dokončené rozehrávky z 10', max: 10, lowerIsBetter: false, ok: 'dokončená', fail: 'nedokončená' },
  { id: 'chain', name: 'Řetězec', what: 'dokončené řetězce z 10', max: 10, lowerIsBetter: false, ok: 'dokončený', fail: 'nedokončený' },
];

/** Metrika stanoviště na stole j (pořadí STATIONS v content.ts). */
export const STATION_METRICS: SoloMetric[] = ['fiveBarControl', 'setShooting', 'blockToControl', 'backRodsBuildUp'];

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
