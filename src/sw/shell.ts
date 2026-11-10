/**
 * Co service worker ukládá a jak odpovídá – čistá logika, testovaná zvlášť (sw.ts ji jen napojí na události).
 *
 * Cíl: po první návštěvě se appka spustí hned i na pomalém spojení nebo bez něj. Ukládá se jen samotná
 * appka (stránka, skripty, styly, ikony, písma). Data klubu jdou vždy přímo do databáze – ta se sem
 * nedostanou (o rychlý start s daty se stará uložený stav v zařízení, storage/snapshot.ts).
 */
export const CACHE = 'foos-lab-shell-v1';

/** Část rozhraní Cache, kterou logika potřebuje. */
export interface CacheLike {
  match(request: string | Request): Promise<Response | undefined>;
  put(request: string | Request, response: Response): Promise<void>;
  delete(request: string | Request): Promise<boolean>;
  keys(): Promise<readonly Request[]>;
}

/**
 * shell  – stránka appky (index.html): uložená hned, na pozadí se obnoví;
 * asset  – skripty a styly s otiskem v názvu: jednou stažené se nemění;
 * static – ikony a manifest; font – písma Google Fonts: uložené hned, na pozadí se obnoví;
 * skip   – všechno ostatní (databáze, zápisy, kontrola verze) jde mimo service worker.
 */
export type Route = 'shell' | 'asset' | 'static' | 'font' | 'skip';

export function routeOf(req: { method: string; url: string; mode?: string }, scope: string): Route {
  if (req.method !== 'GET') return 'skip';
  const host = new URL(req.url).hostname;
  if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') return 'font';
  if (!req.url.startsWith(scope)) return 'skip';
  const path = req.url.slice(scope.length).split(/[?#]/)[0];
  if (path === 'version.json' || path === 'sw.js') return 'skip';
  if (req.mode === 'navigate' || path === '' || path === 'index.html') return 'shell';
  return path.startsWith('assets/') ? 'asset' : 'static';
}

/** Soubory appky, na které odkazuje index.html (relativní adresy; cizí servery ne). */
export function assetsIn(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = m[1].replace(/^\.\//, '');
    if (!/^([a-z]+:)?\/\//i.test(ref) && !ref.startsWith('#') && !ref.startsWith('/')) out.add(ref);
  }
  return [...out];
}

/**
 * Stáhne aktuální stránku a soubory, které ještě uložené nejsou; teprve když je všechno, stránku přepíše
 * a smaže skripty a styly, na které už neodkazuje. Bez spojení (nebo když něco chybí) zůstává uložená verze.
 */
export async function precache(cache: CacheLike, fetchImpl: typeof fetch, scope: string): Promise<void> {
  try {
    const page = await fetchImpl(scope, { cache: 'no-store' });
    if (!page.ok) return;
    const html = await page.clone().text();
    const wanted = assetsIn(html).map((ref) => scope + ref);
    const fresh: [string, Response][] = [];
    for (const url of wanted) {
      if (await cache.match(url)) continue;
      const res = await fetchImpl(url);
      if (!res.ok) return;
      fresh.push([url, res]);
    }
    for (const [url, res] of fresh) await cache.put(url, res);
    await cache.put(scope, page);
    const keep = new Set(wanted);
    for (const req of await cache.keys())
      if (req.url.startsWith(scope + 'assets/') && !keep.has(req.url)) await cache.delete(req.url);
  } catch {
    /* bez spojení: zůstává, co je uložené */
  }
}

/** Ze sítě; povedená odpověď se uloží. */
async function fetchAndStore(request: Request, cache: CacheLike, fetchImpl: typeof fetch): Promise<Response> {
  const res = await fetchImpl(request);
  // Písma z cizího serveru mohou přijít jako neprůhledná odpověď (status 0) – i ta se dá uložit.
  if (res.ok || res.type === 'opaque') await cache.put(request.url, res.clone());
  return res;
}

export async function respond(
  route: Exclude<Route, 'skip'>,
  request: Request,
  cache: CacheLike,
  fetchImpl: typeof fetch,
  scope: string,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<Response> {
  if (route === 'shell') {
    const cached = await cache.match(scope);
    if (cached) {
      waitUntil(precache(cache, fetchImpl, scope));
      return cached;
    }
    const res = await fetchImpl(request);
    waitUntil(precache(cache, fetchImpl, scope));
    return res;
  }
  const cached = await cache.match(request.url);
  if (route === 'asset') return cached ?? fetchAndStore(request, cache, fetchImpl);
  if (cached) {
    waitUntil(fetchAndStore(request, cache, fetchImpl).catch(() => undefined));
    return cached;
  }
  return fetchAndStore(request, cache, fetchImpl);
}
