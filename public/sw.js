// Minimal network-first service worker for the Injective Trading Terminal.
//
// Strategy: navigations (HTML page loads) hit the network first and only fall
// back to the cached shell when offline. Static assets (_nuxt/*, icons) use a
// cache-first strategy. Market data / gRPC-web calls are NEVER cached — prices
// and the order book must stay live.
const CACHE = 'inj-terminal-v1'
const STATIC_RE = /^https?:\/\/[^/]+\/_nuxt\//
const ASSET_RE = /^https?:\/\/[^/]+\/(icon-|favicon)/

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/')))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only handle GET; ignore gRPC-web (market data) and cross-origin entirely.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigations: network-first, fall back to cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
          return resp
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/'))),
    )
    return
  }

  // Static build assets + icons: cache-first.
  if (STATIC_RE.test(url.href) || ASSET_RE.test(url.href)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((resp) => {
            const copy = resp.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
            return resp
          }),
      ),
    )
  }
  // Everything else (XHR/fetch to our APIs) passes straight through uncached.
})
