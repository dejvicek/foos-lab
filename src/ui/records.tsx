import { createContext, useContext, type ReactNode } from 'react';
import { bestsOf, recordNews } from '../domain/records';
import { parseSoloKey } from '../domain/solo';
import { streakTime } from '../domain/streak';
import type { PlayerId, SoloKey, Training } from '../domain/types';

/** Všechny tréninky pro rekordy u cvičení (20. 11. 2026); bez provideru se rekordy neukazují (testy komponent). */
const TrainingsContext = createContext<Training[] | null>(null);

export function TrainingsProvider({ trainings, children }: { trainings: Training[]; children: ReactNode }) {
  return <TrainingsContext.Provider value={trainings}>{children}</TrainingsContext.Provider>;
}

/**
 * Řádek pod dohranou sérií: rekord klubu, nový / vyrovnaný osobní rekord, jinak moje maximum.
 * `series` = trénink a klíč série; null mimo trénink (nic se neukazuje).
 */
export function RecordLine({ series, playerId, value, max }: { series?: { trainingId: string; key: SoloKey }; playerId: PlayerId; value: number; max: number }) {
  const trainings = useContext(TrainingsContext);
  if (!trainings || !series) return null;
  const metric = parseSoloKey(series.key).metric;
  const news = recordNews(metric, value, bestsOf(trainings, metric, playerId, series));
  if (!news) return null;
  const fmt = (v: number) => (max ? `${v} z ${max}` : streakTime(v));
  const text =
    news.kind === 'club' ? 'Rekord klubu!'
    : news.kind === 'personal' ? `Nový osobní rekord${news.before !== null ? ` (dosud ${fmt(news.before)})` : ''}`
    : news.kind === 'equal' ? 'Vyrovnaný osobní rekord'
    : `${max ? 'Tvoje maximum' : 'Tvůj nejlepší čas'}: ${fmt(news.best)}`;
  return <div className={news.kind === 'max' ? 'record-line' : 'record-line new'}>{text}</div>;
}
