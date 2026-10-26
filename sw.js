// Service worker: lets Joint Finance Tracker open with no internet.
// It keeps a copy of the app's own files (never your data — that lives in
// localStorage) and serves them when the network is unavailable.
//
// Strategy: "network first" for the page itself, so you always get the latest
// version when online, falling back to the saved copy offline. Icons and the
// manifest rarely change, so they come from the saved copy first.
// Requests to other websites (the sync server) are never touched or saved.

const CACHE = "joint-finance-v1";
const APP_FILES = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  // Remove copies saved by older versions of this file.
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;   // leave the sync server alone

  if (req.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); }
          return res;
        })
        .catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
