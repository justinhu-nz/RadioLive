// RadioLive Service Worker
// Provides offline support and caching for PWA functionality

const CACHE_VERSION = 'v1';
const CACHE_NAME = `radiolive-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/index.html';

// Static assets to precache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/favicon.png'
];

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

// Helper: Check if URL is an audio stream (never cache these)
function isAudioStream(url) {
  const streamHosts = [
    'centova.geckohost.nz',           // 95bFM stream
    'stream-ice.radionz.co.nz',       // RNZ National stream
    'playerservices.streamtheworld.com', // NewstalkZB stream
    'podcast.radionz.co.nz',          // RNZ news bulletins
    'weekondemand.newstalkzb.co.nz'   // NewstalkZB news bulletins
  ];
  return streamHosts.some(host => url.hostname.includes(host));
}

// Helper: Check if URL is CORS proxy (never cache these)
function isCorsProxy(url) {
  return url.hostname.includes('api.allorigins.win');
}

// Network-first strategy for HTML documents
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

    // Last resort: return offline page
    return caches.match(OFFLINE_PAGE);
  }
}

// Cache-first strategy for static assets
async function cacheFirstStrategy(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Fetch from network if not in cache
  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.error('[ServiceWorker] Cache-first fetch failed:', error.message);

    // For document requests, return offline page
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

  // Strategy 1: Never cache audio streams (live content, massive size)
  if (isAudioStream(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Strategy 2: Never cache CORS proxy requests (dynamic metadata)
  if (isCorsProxy(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Strategy 3: Network-first for HTML documents (fresh content with offline fallback)
  if (request.destination === 'document') {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Strategy 4: Cache-first for static assets (CSS, JS, images)
  event.respondWith(cacheFirstStrategy(request));
});
