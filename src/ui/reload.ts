/** Jak dlouho se čeká, než service worker stáhne novou verzi; pak se stránka načte i tak. */
const REFRESH_WAIT_MS = 5000;

/**
 * Znovu načte appku v nové verzi. Stránku servíruje service worker z uložených souborů, takže ho
 * nejdřív požádá, aby novou verzi stáhl – jinak by se po načtení ukázala znovu ta stará.
 */
export async function reloadApp(): Promise<void> {
  try {
    const worker = (await navigator.serviceWorker?.getRegistration())?.active;
    if (worker)
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(resolve, REFRESH_WAIT_MS);
        channel.port1.onmessage = () => {
          clearTimeout(timer);
          resolve();
        };
        worker.postMessage({ type: 'refresh' }, [channel.port2]);
      });
  } catch {
    /* bez service workeru se prostě načte znovu */
  }
  window.location.reload();
}
