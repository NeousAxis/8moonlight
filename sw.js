const CACHE_NAME = 'moonlight-v2.7';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/astro.js',
    '/vendor/astronomy.browser.min.js',
    '/icon.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/apple-touch-icon.png',
    '/manifest.json'
];

// Installation : mise en cache des assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installation...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Mise en cache des assets');
                return cache.addAll(ASSETS);
            })
            .then(() => self.skipWaiting()) // Force l'activation immédiate
    );
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activation...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Suppression ancien cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Prend le contrôle immédiatement
    );
});

// Fetch : stratégie Network First avec fallback Cache
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Clone et mise en cache de la nouvelle réponse
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                // Si réseau indisponible, utiliser le cache
                return caches.match(event.request);
            })
    );
});

// Écoute des messages pour forcer la mise à jour
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
