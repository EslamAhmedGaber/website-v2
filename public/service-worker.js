const CACHE_VERSION = "elite-igcse-v2-shell-1";
const RUNTIME_CACHE = "elite-igcse-v2-runtime-1";
const APP_SHELL = [
  "/",
  "/practice/",
  "/exam/",
  "/progress/",
  "/downloads/",
  "/topics/",
  "/checkup/",
  "/planner/",
  "/notes/",
  "/about/",
  "/pastpapers/",
  "/offline/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/scripts/firebase-config.js",
  "/scripts/cloud-progress.js",
  "/scripts/lead-app.js",
  "/scripts/topic-normalizer.js",
  "/scripts/practice-app.js",
  "/scripts/exam-app.js",
  "/scripts/topics-app.js",
  "/scripts/checkup-app.js",
  "/scripts/planner-app.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION && key !== RUNTIME_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline/")));
    return;
  }
  if (request.destination === "image" || url.pathname.includes("/downloads/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
