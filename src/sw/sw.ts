/// <reference lib="webworker" />
import { CACHE, precache, respond, routeOf } from './shell';

// Service worker appky (sestaví se jako samostatný soubor sw.js vedle index.html). Logika je v shell.ts.
const sw = self as unknown as ServiceWorkerGlobalScope;
const scope = sw.registration.scope;

sw.addEventListener('install', (e) => {
  // Hned po instalaci stáhnout stránku i její soubory – příští start už síť nepotřebuje.
  e.waitUntil(caches.open(CACHE).then((cache) => precache(cache, fetch, scope)));
  void sw.skipWaiting();
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== CACHE && name.startsWith('foos-lab-')) await caches.delete(name);
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('fetch', (e) => {
  const route = routeOf(e.request, scope);
  if (route === 'skip') return;
  e.respondWith(caches.open(CACHE).then((cache) => respond(route, e.request, cache, fetch, scope, (p) => e.waitUntil(p))));
});

// „Obnovit“ v appce: nejdřív stáhnout novou verzi, pak teprve znovu načíst stránku.
sw.addEventListener('message', (e) => {
  if ((e.data as { type?: string } | null)?.type !== 'refresh') return;
  e.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => precache(cache, fetch, scope))
      .then(() => e.ports[0]?.postMessage('done')),
  );
});
