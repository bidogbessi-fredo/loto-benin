// On passe la version de v8 à v9 pour forcer le rechargement
const CACHE_NAME = 'loto-benin-v36'; 
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './logo.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Mise en cache à l'installation
self.addEventListener('install', (event) => {
  // Force le nouveau Service Worker à s'activer immédiatement
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Interception pour le mode hors-ligne
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
