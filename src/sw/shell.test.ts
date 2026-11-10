import { assetsIn, precache, respond, routeOf, type CacheLike } from './shell';

const SCOPE = 'https://klub.example/foos-lab/';
const HTML = `<!doctype html><html><head>
  <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  <link rel="manifest" href="manifest.webmanifest" />
  <link href="https://fonts.googleapis.com/css2?family=Archivo" rel="stylesheet" />
  <script type="module" crossorigin src="./assets/index-AAA.js"></script>
  <link rel="stylesheet" crossorigin href="./assets/index-BBB.css">
</head><body></body></html>`;

/** Mezipaměť v paměti. */
function fakeCache(initial: Record<string, string> = {}): CacheLike & { has(url: string): boolean; text(url: string): Promise<string | undefined>; urls(): string[] } {
  const store = new Map<string, Response>(Object.entries(initial).map(([k, v]) => [k, new Response(v)]));
  const key = (r: string | Request) => (typeof r === 'string' ? r : r.url);
  return {
    match: async (r) => store.get(key(r))?.clone(),
    put: async (r, res) => void store.set(key(r), res),
    delete: async (r) => store.delete(key(r)),
    keys: async () => [...store.keys()].map((url) => new Request(url)),
    has: (url) => store.has(url),
    text: async (url) => store.get(url)?.clone().text(),
    urls: () => [...store.keys()].sort(),
  };
}

/** Síť: odpovědi podle adresy; chybějící adresa = bez spojení. */
function net(pages: Record<string, string>) {
  const asked: string[] = [];
  const fetchImpl = (async (input: string | Request) => {
    const url = typeof input === 'string' ? input : input.url;
    asked.push(url);
    if (!(url in pages)) throw new TypeError('Failed to fetch');
    return new Response(pages[url]);
  }) as typeof fetch;
  return { fetchImpl, asked };
}

const req = (path: string, init: { method?: string; mode?: string } = {}) => ({ url: path.startsWith('http') ? path : SCOPE + path, method: init.method ?? 'GET', mode: init.mode });

describe('service worker – co se kam ukládá', () => {
  it('routeOf: stránka appky, její soubory, písma; databáze a zápisy jdou mimo', () => {
    expect(routeOf(req('', { mode: 'navigate' }), SCOPE)).toBe('shell');
    expect(routeOf(req('index.html'), SCOPE)).toBe('shell');
    expect(routeOf(req('assets/index-AAA.js'), SCOPE)).toBe('asset');
    expect(routeOf(req('favicon.svg'), SCOPE)).toBe('static');
    expect(routeOf(req('https://fonts.gstatic.com/s/archivo/x.woff2'), SCOPE)).toBe('font');
    expect(routeOf(req('https://fonts.googleapis.com/css2?family=Archivo'), SCOPE)).toBe('font');
    expect(routeOf(req('version.json?t=1'), SCOPE)).toBe('skip'); // kontrola verze vždy ze sítě
    expect(routeOf(req('sw.js'), SCOPE)).toBe('skip');
    expect(routeOf(req('https://abc.supabase.co/rest/v1/rpc/changes_since'), SCOPE)).toBe('skip');
    expect(routeOf(req('assets/index-AAA.js', { method: 'POST' }), SCOPE)).toBe('skip');
    expect(routeOf(req('https://klub.example/jina-appka/'), SCOPE)).toBe('skip');
  });

  it('assetsIn: soubory appky, na které odkazuje index.html (bez cizích adres)', () => {
    expect(assetsIn(HTML).sort()).toEqual(['assets/index-AAA.js', 'assets/index-BBB.css', 'favicon.svg', 'manifest.webmanifest']);
  });

  it('precache: uloží stránku i její soubory, takže příští start nepotřebuje síť', async () => {
    const cache = fakeCache();
    const { fetchImpl } = net({ [SCOPE]: HTML, [SCOPE + 'assets/index-AAA.js']: 'js', [SCOPE + 'assets/index-BBB.css']: 'css', [SCOPE + 'favicon.svg']: 'svg', [SCOPE + 'manifest.webmanifest']: '{}' });
    await precache(cache, fetchImpl, SCOPE);
    expect(cache.urls()).toEqual([SCOPE, SCOPE + 'assets/index-AAA.js', SCOPE + 'assets/index-BBB.css', SCOPE + 'favicon.svg', SCOPE + 'manifest.webmanifest'].sort());
  });

  it('precache: po nasazení nové verze stáhne nové soubory a staré smaže', async () => {
    const cache = fakeCache({ [SCOPE]: 'stará', [SCOPE + 'assets/index-OLD.js']: 'staré', [SCOPE + 'favicon.svg']: 'svg' });
    const { fetchImpl, asked } = net({ [SCOPE]: HTML, [SCOPE + 'assets/index-AAA.js']: 'js', [SCOPE + 'assets/index-BBB.css']: 'css', [SCOPE + 'manifest.webmanifest']: '{}' });
    await precache(cache, fetchImpl, SCOPE);
    expect(await cache.text(SCOPE)).toBe(HTML);
    expect(cache.has(SCOPE + 'assets/index-OLD.js')).toBe(false);
    expect(cache.has(SCOPE + 'assets/index-AAA.js')).toBe(true);
    expect(asked).not.toContain(SCOPE + 'favicon.svg'); // co už uložené je, se znovu nestahuje
  });

  it('precache: bez spojení nic nerozbije – uložená verze zůstává', async () => {
    const cache = fakeCache({ [SCOPE]: 'stará', [SCOPE + 'assets/index-OLD.js']: 'staré' });
    await precache(cache, net({}).fetchImpl, SCOPE);
    expect(cache.urls()).toEqual([SCOPE, SCOPE + 'assets/index-OLD.js']);
  });

  it('precache: když se nový soubor nestáhne, stará verze se nepřepíše napůl', async () => {
    const cache = fakeCache({ [SCOPE]: 'stará', [SCOPE + 'assets/index-OLD.js']: 'staré' });
    await precache(cache, net({ [SCOPE]: HTML, [SCOPE + 'assets/index-AAA.js']: 'js' }).fetchImpl, SCOPE);
    expect(await cache.text(SCOPE)).toBe('stará');
    expect(cache.has(SCOPE + 'assets/index-OLD.js')).toBe(true);
  });
});

describe('service worker – odpovědi', () => {
  const later: Promise<unknown>[] = [];
  const waitUntil = (p: Promise<unknown>) => void later.push(p);

  it('stránka: uložená hned (i bez spojení), na pozadí se obnoví', async () => {
    const cache = fakeCache({ [SCOPE]: 'uložená stránka' });
    const { fetchImpl } = net({ [SCOPE]: HTML, [SCOPE + 'assets/index-AAA.js']: 'js', [SCOPE + 'assets/index-BBB.css']: 'css', [SCOPE + 'favicon.svg']: 'svg', [SCOPE + 'manifest.webmanifest']: '{}' });
    const res = await respond('shell', new Request(SCOPE), cache, fetchImpl, SCOPE, waitUntil);
    expect(await res.text()).toBe('uložená stránka');
    await Promise.all(later);
    expect(await cache.text(SCOPE)).toBe(HTML);
    expect(await (await respond('shell', new Request(SCOPE), cache, net({}).fetchImpl, SCOPE, waitUntil)).text()).toBe(HTML);
  });

  it('stránka: první návštěva jde ze sítě', async () => {
    const cache = fakeCache();
    const res = await respond('shell', new Request(SCOPE), cache, net({ [SCOPE]: HTML }).fetchImpl, SCOPE, waitUntil);
    expect(await res.text()).toBe(HTML);
  });

  it('soubory appky: jednou stažené se berou z uložených', async () => {
    const cache = fakeCache();
    const url = SCOPE + 'assets/index-AAA.js';
    const first = net({ [url]: 'js' });
    expect(await (await respond('asset', new Request(url), cache, first.fetchImpl, SCOPE, waitUntil)).text()).toBe('js');
    const second = net({});
    expect(await (await respond('asset', new Request(url), cache, second.fetchImpl, SCOPE, waitUntil)).text()).toBe('js');
    expect(second.asked).toEqual([]);
  });

  it('písma a ikony: uložené hned, na pozadí se obnoví; bez uložených ze sítě', async () => {
    const url = 'https://fonts.gstatic.com/s/archivo/x.woff2';
    const cache = fakeCache({ [url]: 'staré písmo' });
    const res = await respond('font', new Request(url), cache, net({ [url]: 'nové písmo' }).fetchImpl, SCOPE, waitUntil);
    expect(await res.text()).toBe('staré písmo');
    await Promise.all(later);
    expect(await cache.text(url)).toBe('nové písmo');
    expect(await (await respond('static', new Request(SCOPE + 'favicon.svg'), fakeCache(), net({ [SCOPE + 'favicon.svg']: 'svg' }).fetchImpl, SCOPE, waitUntil)).text()).toBe('svg');
  });

  it('chybová odpověď serveru se neukládá', async () => {
    const cache = fakeCache();
    const url = SCOPE + 'assets/chybi.js';
    const fetchImpl = (async () => new Response('není', { status: 404 })) as typeof fetch;
    expect((await respond('asset', new Request(url), cache, fetchImpl, SCOPE, waitUntil)).status).toBe(404);
    expect(cache.has(url)).toBe(false);
  });
});
