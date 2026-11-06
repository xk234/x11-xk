/* x11 service worker: offline app shell + lazy, cacheable engine assets.
 * Never caches API/R2/raw payload traffic, POSTs, authenticated requests or ranges.
 */
const VERSION = "x11-shell-v1";
const SHELL_CACHE = VERSION;
const ASSET_CACHE = "x11-assets-v1";
const MAX_ASSETS = 160;
const SHELL_URLS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_URLS.map(async (url) => {
      try { await cache.add(new Request(url, { cache: "reload" })); } catch { /* offline-first install is best effort */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("x11-") && ![SHELL_CACHE, ASSET_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function bypass(request, url) {
  return request.method !== "GET" ||
    request.headers.has("range") ||
    request.headers.has("authorization") ||
    url.origin !== self.location.origin ||
    url.pathname === "/r" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/_server/") ||
    url.pathname.startsWith("/_tanstack/") ||
    url.pathname.startsWith("/storage/");
}

function isStaticAsset(url) {
  return /\.[a-f0-9]{8,}\.(?:js|css|woff2?|ttf|otf|wasm)$/i.test(url.pathname) ||
    /\.(?:js|css|woff2?|ttf|otf|wasm|png|jpe?g|webp|avif|svg|ico)$/i.test(url.pathname) ||
    url.pathname.startsWith("/engines/");
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ASSETS) return;
  await Promise.all(keys.slice(0, keys.length - MAX_ASSETS).map((key) => cache.delete(key)));
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match("/index.html")) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const update = fetch(request).then(async (response) => {
    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
      await trimCache(cache);
    }
    return response;
  }).catch(() => null);
  return cached || (await update) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  let url;
  try { url = new URL(request.url); } catch { return; }
  if (bypass(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
