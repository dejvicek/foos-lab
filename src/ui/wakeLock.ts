import { useEffect } from 'react';

interface Sentinel {
  release(): Promise<void>;
}
type WakeLockNav = Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } };

/** Drží obrazovku zapnutou, dokud je `active` (Rozcvička na telefonu); kde prohlížeč neumí, nic se nestane. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as WakeLockNav;
    if (!nav.wakeLock) return;
    let lock: Sentinel | null = null;
    let gone = false;
    const acquire = () => {
      nav.wakeLock!.request('screen').then(
        (s) => (gone ? void s.release().catch(() => {}) : (lock = s)),
        () => {},
      );
    };
    // Po návratu do appky (zámek prohlížeč uvolní při skrytí) zámek obnovit.
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
