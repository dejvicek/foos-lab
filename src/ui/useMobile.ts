import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';
const matches = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;

/** Telefon (≤ 767 px): jiné rozvržení některých obrazovek (PRD 7.1). */
export function useMobile(): boolean {
  const [mobile, setMobile] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}
