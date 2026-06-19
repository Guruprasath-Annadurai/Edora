// ─────────────────────────────────────────────────────────────────────────────
// Edora Service Worker — CDN-aware offline caching
//
// Strategy:
//   /assets/** — Cache-first (files are content-hashed, safe to cache forever)
//   /          — Network-first with offline fallback to cached index.html
//   supabase   — Network-only (auth + live data must be fresh)
//   fonts/img  — Stale-while-revalidate
// ─────────────────────────────────────────────────────────────────────────────

// '%CACHE_VERSION%' is stamped with the package.json version at build time
// (see the stamp-sw plugin in vite.config.ts)
const CACHE_VERSION = '%CACHE_VERSION%';
const STATIC_CACHE  = `edora-static-${CACHE_VERSION}`;
const FONT_CACHE    = `edora-fonts-${CACHE_VERSION}`;
const APP_SHELL     = ['/'];

// ── Install — pre-cache app shell ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate — clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('edora-') && k !== STATIC_CACHE && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch — routing logic ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept non-GET requests or cross-origin API calls
  if (req.method !== 'GET') return;

  // ── Supabase / Firebase auth — always network ────────────────────────────
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('google') ||
    url.pathname.includes('/functions/v1/')
  ) {
    event.respondWith(fetch(req));
    return;
  }

  // ── Content-hashed assets — cache-first, never stale ─────────────────────
  // Vite outputs /assets/[name].[contenthash].[ext] — these are immutable
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const response = await fetch(req);
        if (response.ok) cache.put(req, response.clone());
        return response;
      })
    );
    return;
  }

  // ── Fonts & icons — stale-while-revalidate ────────────────────────────────
  if (
    url.pathname.match(/\.(woff2?|ttf|otf|eot)$/) ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const networkFetch = fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // ── HTML navigation — network-first, offline fallback ────────────────────
  // Critical for SPA: if offline, serve the cached shell so the app loads
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req)
        .then(response => {
          // Cache the fresh HTML
          if (response.ok) {
            caches.open(STATIC_CACHE).then(c => c.put(req, response.clone()));
          }
          return response;
        })
        .catch(async () => {
          // Offline: serve the cached index.html for SPA routing
          const cached = await caches.match('/') || await caches.match('/index.html');
          if (cached) return cached;
          // Last resort: simple offline message
          return new Response(
            '<html><body style="font-family:sans-serif;text-align:center;padding:2rem">' +
            '<h2>You\'re offline</h2><p>Open Edora from the app instead, or reconnect and refresh.</p>' +
            '</body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }
});

// ── Background sync — flush queued events and offline study data ─────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'flush-events' || event.tag === 'flush-study-queue') {
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(client =>
          client.postMessage({
            type: event.tag === 'flush-study-queue'
              ? 'FLUSH_STUDY_QUEUE'
              : 'FLUSH_ANALYTICS',
          })
        )
      )
    );
  }

  // Pre-fetch offline study content when back online and on WiFi
  if (event.tag === 'prefetch-study-content') {
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(client => client.postMessage({ type: 'RUN_OFFLINE_PREFETCH' }))
      )
    );
  }
});

// ── Message handler — app can request background sync registration ────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'REGISTER_SYNC') {
    self.registration.sync?.register('flush-study-queue').catch(() => {});
  }
  if (event.data?.type === 'REGISTER_PREFETCH') {
    self.registration.sync?.register('prefetch-study-content').catch(() => {});
  }
});
