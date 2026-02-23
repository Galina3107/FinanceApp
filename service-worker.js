// Service Worker for Finance App PWA
const CACHE_NAME = 'finance-app-v12';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/styles.css',
    './js/db.js',
    './js/crypto.js',
    './js/i18n.js',
    './js/utils.js',
    './js/categories.js',
    './js/transactions.js',
    './js/goals.js',
    './js/future-expenses.js',
    './js/income.js',
    './js/budget.js',
    './js/dashboard.js',
    './js/security.js',
    './js/settings.js',
    './js/app.js',
    './lib/chart.min.js',
    './lib/xlsx.full.min.js',
    './icons/icon.svg',
    './manifest.json'
];

// Install event - cache all assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching app assets...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip external requests (like Google Fonts)
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) {
        // For external resources, try network first, fall back to cache
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // For local assets: cache first, fallback to network
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    // Return cached version but also update cache in background
                    fetch(event.request).then(response => {
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, response);
                        });
                    }).catch(() => {});
                    return cachedResponse;
                }
                // Not in cache - fetch from network and cache it
                return fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clone);
                    });
                    return response;
                });
            })
    );
});
