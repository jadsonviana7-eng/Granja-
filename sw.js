const CACHE_NAME = "granja-viana-pwa-v5.0";
const APP_SHELL = [
  "./index.html",
  "./manifest.webmanifest",
  "./logo.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./src/styles/variables.css",
  "./src/styles/layout.css",
  "./src/styles/components.css",
  "./src/styles/pages.css",
  "./src/main.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        APP_SHELL.map((asset) => cache.add(asset).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((response) => {
          if (response) return response;
          if (event.request.mode === "navigate") return caches.match("./index.html");
        });
      })
  );
});

