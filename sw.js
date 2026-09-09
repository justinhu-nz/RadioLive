// RadioLive Service Worker
// Provides offline support and caching for PWA functionality

const CACHE_VERSION = 'v2';
const CACHE_NAME = `radiolive-${CACHE_VERSION}`;
const APP_ROOT = new URL('./', self.location.href);
const OFFLINE_PAGE = new URL('index.html', APP_ROOT).toString();

// Static assets to precache
const STATIC_ASSETS = [
  './',
  'index.html',
  'app.js',
  'style.css',
  'manifest.json',
  'apple-touch-icon.png',
  'favicon.png'
].map(path => new URL(path, APP_ROOT).toString());

// Install event - precache all static assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing version:', CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((error) => {
        console.error('[ServiceWorker] Cache installation failed:', error);
        throw error;
      })
      .then(() => {
        console.log('[ServiceWorker] Skip waiting');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating version:', CACHE_VERSION);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Remove old RadioLive caches
              return name.startsWith('radiolive-') && name !== CACHE_NAME;
            })
            .map((name) => {
              console.log('[ServiceWorker] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Network-first strategy for same-origin app resources
async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);

    // Only cache successful responses
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.warn('[ServiceWorker] Network fetch failed, trying cache:', error.message);

    // Try cache as fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Documents can fall back to the app shell. Other missing assets should
    // remain failures rather than being served HTML with the wrong MIME type.
    if (request.destination === 'document') {
      return caches.match(OFFLINE_PAGE);
    }
    throw error;
  }
}

// Fetch event - route requests to appropriate strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Cache APIs only support GET, and third-party resources have their own
  // caching semantics. Let the browser handle both directly.
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Keep app code fresh while retaining the cached app shell for offline use.
  event.respondWith(networkFirstStrategy(request));
});
