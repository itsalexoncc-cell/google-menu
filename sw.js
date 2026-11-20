const CACHE_NAME = 'google-apps-shell-v3';
const ICON_CACHE = 'google-apps-icons-v3';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      // Иконку кэшируем отдельно, чтобы ошибка с ней не сорвала установку SW
      try {
        await cache.add('./icon.jpg');
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
          .filter((key) => key !== CACHE_NAME && key !== ICON_CACHE)
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

  // 1. Не перехватываем поиск в Google и запросы к iTunes API
  if (url.hostname.includes('google.com') || url.hostname.includes('itunes.apple.com')) {
    return;
  }

  // 2. Открытие самой страницы (Stale-While-Revalidate: мгновенно из кэша, обновление в фоне)
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached =
          (await cache.match('./index.html')) ||
          (await cache.match('./')) ||
          (await cache.match(req, { ignoreSearch: true }));

        const networkFetch = fetch(req)
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

  // 3. Картинки и иконки приложений (включая сторонние домены mzstatic / googleusercontent)
  if (
    req.destination === 'image' ||
    url.hostname.includes('mzstatic.com') ||
    url.hostname.includes('googleusercontent.com')
  ) {
    event.respondWith(
      caches.open(ICON_CACHE).then(async (cache) => {
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

  // 4. Остальные локальные файлы (manifest.json и т.д.)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
    );
  }
});