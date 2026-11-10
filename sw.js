const CACHE = "project23-v1";
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "firebase-config.js",
  "manifest.json",
  "assets/logo.png",
  "assets/icon.png",
  "assets/apple-touch-icon.png",
  "js/site-config.js",
  "js/core.js",
  "js/widgets.js",
  "js/world.js",
  "pages/about.html",
  "pages/finance.html",
  "pages/grades.html",
  "pages/stylist.html",
  "pages/vinyl.html",
  "pages/notes.html",
  "pages/snippet.html",
  "pages/calendar.html",
  "pages/todo.html",
  "pages/focus.html",
  "pages/timeUntil.html",
  "pages/schedule.html",
  "pages/goals.html",
  "pages/watchlist.html",
  "pages/weather.html",
  "pages/birthday.html",
  "pages/pico.html",
  "pages/so-thats-how.html",
  "pages/project.html",
  "pages/projectNotes.html",
  "pages/projectMedley.html",
  "pages/projectWeb.html"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c =>
        c.addAll(SHELL).catch(() =>
          Promise.allSettled(SHELL.map(u => c.add(u).catch(err => console.warn("[SW] Cache add err:", u, err))))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: "SW_UPDATED", version: CACHE });
          });
        });
      })
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then(m => m || caches.match("./index.html")))
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./index.html";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ("focus" in c) {
          c.focus();
          if ("navigate" in c) c.navigate(url).catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
