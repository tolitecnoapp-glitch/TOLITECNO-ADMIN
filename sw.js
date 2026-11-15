const CACHE_NAME = 'tolitecno-admin-v1';
const BASE_PATH = '/TOLITECNO-ADMIN';

const APP_SHELL = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/icon-192.png`,
  `${BASE_PATH}/icon-512.png`
];

// Instalación: precache del shell principal sin fallar si algún recurso tarda
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(new Request(url, { cache: 'reload' }))
        )
      );
    })
  );
  self.skipWaiting();
});

// Activación: limpiar cachés antiguas y tomar control inmediato
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Estrategia de fetch:
// - Nunca cachear llamadas a Supabase (datos siempre en tiempo real)
// - Network-first para navegación HTML (con fallback offline)
// - Cache-first con actualización en segundo plano para archivos estáticos del repo
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Ignorar Supabase y esquemas no http(s)
  if (
    !url.protocol.startsWith('http') ||
    url.hostname.includes('supabase.co')
  ) {
    return;
  }

  // Navegación principal (HTML): Network-First con fallback a caché
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached =
            (await caches.match(request)) ||
            (await caches.match(`${BASE_PATH}/index.html`)) ||
            (await caches.match(`${BASE_PATH}/`));
          return cached || Response.error();
        })
    );
    return;
  }

  // Recursos estáticos del mismo origen (iconos, manifest, etc.): Cache-First + revalidación
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const networkFetch = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || networkFetch;
      })
    );
    return;
  }

  // Recursos externos (Tailwind CDN, Supabase JS CDN, logo): Network-First con fallback a caché
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});
