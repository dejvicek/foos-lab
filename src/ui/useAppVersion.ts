import { useEffect, useState } from 'react';
import { compareVersion, myVersion, type AppVersion, type VersionState } from '../storage/appVersion';

/** Nejdřív za minutu znovu (návraty do appky jdou rychle po sobě); otevřená appka se ptá po 5 minutách. */
const MIN_GAP_MS = 60_000;
const EVERY_MS = 5 * 60_000;

const RANK: Record<VersionState, number> = { current: 0, update: 1, required: 2 };

/**
 * Je nasazená novější verze appky? Ptá se při startu, při návratu do appky a průběžně. Telefon, který má
 * appku otevřenou přes nasazení nové verze, by jinak běžel dál se starým kódem (a třeba jiným rozpisem).
 * Bez `latest` (testy, vývoj) se nekontroluje.
 */
export function useAppVersion(latest?: () => Promise<AppVersion | null>): VersionState {
  const [state, setState] = useState<VersionState>('current');
  useEffect(() => {
    if (!latest) return;
    let alive = true;
    let last = 0;
    const check = () => {
      if (Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      void latest().then((v) => {
        const next = compareVersion(myVersion, v);
        // Jednou zjištěná novější verze platí, i když se další dotaz nepovede.
        if (alive) setState((s) => (RANK[next] > RANK[s] ? next : s));
      });
    };
    check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, EVERY_MS);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [latest]);
  return state;
}
