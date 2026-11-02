import type { Match, Score } from './types';

export const LEG_TO = 6;
export const LEG_CAP = 10;
export const MAX_LOSSES = 30;

/** Stav na stole: odehrané góly + scénářový start. */
export function tableScore(m: Match, s: Score | undefined): [number, number] {
  const [sa, sb] = m.start ?? [0, 0];
  return [(s?.ga ?? 0) + sa, (s?.gb ?? 0) + sb];
}


/** PRD 7.1: konec legu – do 6; 5:5 o 2 se stropem 10; simulace do 2 setů. */
export function legOver(m: Match, s: Score | undefined): { over: boolean; winner: 'A' | 'B' | null } {
  const [a, b] = m.block === 'sim' ? [s?.ga ?? 0, s?.gb ?? 0] : tableScore(m, s);
  let over: boolean;
  if (m.block === 'sim') over = a >= 2 || b >= 2;
  else if (m.start && m.start[0] === 5 && m.start[1] === 5) over = (Math.max(a, b) >= LEG_TO && Math.abs(a - b) >= 2) || Math.max(a, b) >= LEG_CAP;
  else over = Math.max(a, b) >= LEG_TO;
  return { over, winner: over ? (a > b ? 'A' : b > a ? 'B' : null) : null };
}

/** Nejvyšší ukládaná hodnota pole (odehrané góly do stropu 10 na stole, sety ≤ 2, ztráty ≤ 30). */
export function bumpLimit(m: Match, field: keyof Score): number {
  if (field === 'la' || field === 'lb') return MAX_LOSSES;
  if (m.block === 'sim') return 2;
  const offset = field === 'ga' ? (m.start?.[0] ?? 0) : (m.start?.[1] ?? 0);
  return LEG_CAP - offset;
}

/**
 * Přičte/odečte ťuknutím; nejde pod 0 ani přes strop. Druhé pole dvojice (góly / ztráty)
 * dostane 0, aby se leg 6:0 počítal jako zapsaný (souhrn bere jen legy s oběma góly).
 */
export function bump(m: Match, s: Score, field: keyof Score, delta: number): Score {
  const next = Math.min(bumpLimit(m, field), Math.max(0, (s[field] ?? 0) + delta));
  const pair: (keyof Score)[] = field === 'ga' || field === 'gb' ? ['ga', 'gb'] : ['la', 'lb'];
  const out: Score = { ...s };
  for (const f of pair) out[f] = s[f] ?? 0;
  out[field] = next;
  return out;
}
