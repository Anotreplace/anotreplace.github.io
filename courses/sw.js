// Ànotreplace · Calendrier des courses : fonctionnement hors connexion.
// - La page et ses fichiers sont gardés en cache : l'appli s'ouvre même sans réseau.
// - La page est toujours redemandée au réseau d'abord (pour avoir la dernière version).
// - Les données du collectif (Google Apps Script) ne passent jamais par ce cache :
//   la page garde elle-même le dernier état connu sur le téléphone.
const CACHE = "anp-courses-v1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "logo-anotreplace.svg", "icon-192.png", "icon-512.png", "calendrier-fftri.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const fromNetwork = (req) => fetch(req).then((res) => {
  if (res && (res.ok || res.type === "opaque")) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const cdn = url.hostname === "cdnjs.cloudflare.com" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!same && !cdn) return; // API Google, sites officiels… : réseau seul

  if (req.mode === "navigate" || (same && /\.(html|json)$|\/$/.test(url.pathname))) {
    // Réseau d'abord, cache si hors connexion.
    e.respondWith(fromNetwork(req).catch(() => caches.match(req).then((r) => r || caches.match("index.html"))));
    return;
  }
  // Bibliothèques, polices, images : cache d'abord, mis à jour en arrière-plan.
  e.respondWith(caches.match(req).then((hit) => {
    const net = fromNetwork(req).catch(() => hit);
    return hit || net;
  }));
});
