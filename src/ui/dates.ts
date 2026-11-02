/** Dnešní datum v místní časové zóně jako YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** „Pátek 31. října 2026“ */
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** „31. 10. 2026“ */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}. ${m}. ${y}`;
}

/** Začátek nového tréninku: aktuální čas zaokrouhlený na 30 min nahoru (HH:MM); přes půlnoc ne. */
export function nextHalfHour(now: Date): string {
  const min = now.getHours() * 60 + now.getMinutes();
  const up = Math.min(23 * 60 + 30, Math.ceil(min / 30) * 30);
  return `${String(Math.floor(up / 60)).padStart(2, '0')}:${String(up % 60).padStart(2, '0')}`;
}
