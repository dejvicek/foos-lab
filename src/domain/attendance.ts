import { FORM_DAYS, resolveRange } from './ladder';
import { isClub } from './practice';
import { sortTrainings } from './training';
import type { PlayerId, Training } from './types';

/** Docházka hráče (10. 11. 2026): kdy byl naposledy, kolikrát ve formě (28 dní) a celkem. */
export interface PlayerAttendance {
  /** Datum posledního tréninku (YYYY-MM-DD), null = zatím nebyl. */
  last: string | null;
  /** Tréninky za posledních FORM_DAYS dní včetně dneška. */
  recent: number;
  total: number;
}

export { FORM_DAYS };

/** Uložené klubové tréninky do dneška (budoucí a vlastní se nepočítají), bez `except` (trénink, který se právě upravuje). */
const past = (trainings: Training[], today: string, except?: string) => trainings.filter((t) => isClub(t) && t.id !== except && t.date <= today);

/** Docházka všech hráčů, kteří na nějakém tréninku byli. `today` jako parametr (žádné new Date v doméně). */
export function attendance(trainings: Training[], today: string, except?: string): Map<PlayerId, PlayerAttendance> {
  const form = resolveRange({ kind: 'form' }, today);
  const out = new Map<PlayerId, PlayerAttendance>();
  for (const t of past(trainings, today, except)) {
    const recent = t.date >= form.from! && t.date <= form.to!;
    for (const p of new Set(t.attendees)) {
      const a = out.get(p) ?? { last: null, recent: 0, total: 0 };
      out.set(p, { last: a.last === null || t.date > a.last ? t.date : a.last, recent: a.recent + (recent ? 1 : 0), total: a.total + 1 });
    }
  }
  return out;
}

/** Poslední trénink podle data (pro „Jako minule“), bez budoucích a bez `except`; null = žádný. */
export function lastTraining(trainings: Training[], today: string, except?: string): Training | null {
  return sortTrainings(past(trainings, today, except))[0] ?? null;
}
