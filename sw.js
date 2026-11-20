const CACHE_NAME = 'google-apps-shell-v4';
const ASSET_CACHE = 'google-apps-assets-v3';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of APP_SHELL) {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res && res.ok) {
          await cache.put(url, res);
        }
      }
      try {
        const iconRes = await fetch('./icon.jpg', { cache: 'no-cache' });
        if (iconRes && iconRes.ok) {
          await cache.put('./icon.jpg', iconRes);
        }
      } catch (e) {}
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== ASSET_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Не перехватываем поиск Google и запросы к iTunes API
  if (url.hostname.includes('google.com') || url.hostname.includes('itunes.apple.com')) {
    return;
  }

  // 2. Сама страница (Stale-While-Revalidate: мгновенно из кэша, обновление в фоне)
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached =
          (await cache.match('./index.html')) ||
          (await cache.match('./')) ||
          (await cache.match(req, { ignoreSearch: true }));

        const networkFetch = fetch(req, { cache: 'no-cache' })
          .then((res) => {
            if (res && res.ok) {
              cache.put('./index.html', res.clone());
              cache.put('./', res.clone());
            }
            return res;
          })
          .catch(() => null);

        return cached || (await networkFetch);
      })
    );
    return;
  }

  // 3. Иконки приложений и Google Fonts (Cache-First)
  if (
    req.destination === 'image' ||
    req.destination === 'font' ||
    url.hostname.includes('mzstatic.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;

        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === 'opaque')) {
            cache.put(req, res.clone());
          }
          return res;
        } catch (e) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // 4. Остальные локальные файлы (manifest.json и др.)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        const res = await fetch(req, { cache: 'no-cache' });
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
    );
  }
});
