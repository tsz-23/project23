const CACHE = "project23-v3";
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

const SW_DB_NAME = "p23-bg-notif-db";
const SW_STORE_NAME = "state";
const SW_STATE_KEY = "notifState";

function openSwDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SW_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SW_STORE_NAME)) {
        db.createObjectStore(SW_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readSwState() {
  try {
    const db = await openSwDb();
    return await new Promise(resolve => {
      const tx = db.transaction(SW_STORE_NAME, "readonly");
      const req = tx.objectStore(SW_STORE_NAME).get(SW_STATE_KEY);
      req.onsuccess = () =>
        resolve(req.result || { notifyOn: false, schedule: [], fired: {}, pendingLog: [], webPushActive: false });
      req.onerror = () =>
        resolve({ notifyOn: false, schedule: [], fired: {}, pendingLog: [], webPushActive: false });
    });
  } catch {
    return { notifyOn: false, schedule: [], fired: {}, pendingLog: [], webPushActive: false };
  }
}

async function writeSwState(stateObj) {
  try {
    const db = await openSwDb();
    await new Promise(resolve => {
      const tx = db.transaction(SW_STORE_NAME, "readwrite");
      tx.objectStore(SW_STORE_NAME).put(stateObj, SW_STATE_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {}
}

let swWakeTimer = null;

async function notifyClientsOfFired(fired, newlyFired) {
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach(c => c.postMessage({ type: "P23_SW_FIRED_SYNC", fired, newlyFired }));
  } catch {}
}

async function checkAndFireSwNotifications() {
  clearTimeout(swWakeTimer);
  swWakeTimer = null;

  const stateObj = await readSwState();
  if (!stateObj || !stateObj.notifyOn || !Array.isArray(stateObj.schedule)) return;
  if (stateObj.webPushActive) return;

  const now = Date.now();
  const WINDOW = 60 * 60000;
  const fired = Object.assign({}, stateObj.fired || {});
  const pendingLog = Array.isArray(stateObj.pendingLog) ? stateObj.pendingLog.slice() : [];
  let dirty = false;
  const newlyFired = [];

  let hasFocusedClient = false;
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    hasFocusedClient = clients.some(c => c.focused || c.visibilityState === "visible");
  } catch {}

  let nextUpcomingDelay = Infinity;

  for (const item of stateObj.schedule) {
    if (!item || !item.key || fired[item.key]) continue;
    const diff = item.fireAt - now;
    if (diff <= 0 && now - item.fireAt < WINDOW) {
      if (!hasFocusedClient) {
        fired[item.key] = now;
        dirty = true;
        newlyFired.push(item);
        pendingLog.push({ title: item.title, body: item.body || "", key: item.key, url: item.url || "./index.html", ts: now });
        try {
          await self.registration.showNotification(item.title, {
            body: item.body || "",
            tag: item.key,
            icon: "assets/icon.png",
            badge: "assets/icon.png",
            renotify: false,
            data: { url: item.url || "./index.html", key: item.key }
          });
        } catch {}
      }
    } else if (diff > 0 && diff < nextUpcomingDelay) {
      nextUpcomingDelay = diff;
    }
  }

  for (const k in fired) {
    if (now - fired[k] > 7 * 86400000) {
      delete fired[k];
      dirty = true;
    }
  }

  if (dirty) {
    stateObj.fired = fired;
    stateObj.pendingLog = pendingLog.slice(-40);
    await writeSwState(stateObj);
    await notifyClientsOfFired(fired, newlyFired);
  }

  if (Number.isFinite(nextUpcomingDelay) && nextUpcomingDelay > 0 && nextUpcomingDelay <= 30 * 60000) {
    swWakeTimer = setTimeout(() => {
      checkAndFireSwNotifications();
    }, Math.min(nextUpcomingDelay + 250, 5 * 60000));
  }
}

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
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(async () => {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        clients.forEach(client => {
          client.postMessage({ type: "SW_UPDATED", version: CACHE });
        });
      })
  );
});

self.addEventListener("message", e => {
  const data = e.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "P23_SYNC_SCHEDULE") {
    e.waitUntil(
      (async () => {
        const prev = await readSwState();
        const mergedFired = Object.assign({}, prev.fired || {}, data.fired || {});
        const pendingLog = Array.isArray(prev.pendingLog) ? prev.pendingLog : [];
        const nextState = {
          notifyOn: Boolean(data.notifyOn),
          webPushActive: Boolean(data.webPushActive),
          schedule: Array.isArray(data.schedule) ? data.schedule : [],
          fired: mergedFired,
          pendingLog: [],
          updatedAt: Date.now()
        };
        await writeSwState(nextState);
        await notifyClientsOfFired(mergedFired, pendingLog);
        await checkAndFireSwNotifications();
      })()
    );
  } else if (data.type === "P23_CHECK_NOW") {
    e.waitUntil(checkAndFireSwNotifications());
  }
});

self.addEventListener("periodicsync", e => {
  if (e.tag === "p23-notif-check") {
    e.waitUntil(checkAndFireSwNotifications());
  }
});

self.addEventListener("sync", e => {
  if (e.tag === "p23-notif-check") {
    e.waitUntil(checkAndFireSwNotifications());
  }
});

self.addEventListener("push", e => {
  e.waitUntil(
    (async () => {
      let payload = null;
      if (e.data) {
        try {
          payload = e.data.json();
        } catch {
          const txt = e.data.text();
          if (txt) payload = { title: "Project 23", body: txt };
        }
      }
      if (!payload || !payload.title) return;

      const tag = payload.tag || "p23-push-" + Date.now();
      const now = Date.now();
      const stateObj = await readSwState();
      const fired = Object.assign({}, stateObj.fired || {});

      if (fired[tag]) return;

      fired[tag] = now;
      stateObj.fired = fired;
      stateObj.webPushActive = true;
      const itemLog = {
        title: payload.title,
        body: payload.body || "",
        key: tag,
        url: payload.url || "./index.html",
        ts: now
      };
      const pendingLog = Array.isArray(stateObj.pendingLog) ? stateObj.pendingLog.slice() : [];
      pendingLog.push(itemLog);
      stateObj.pendingLog = pendingLog.slice(-40);
      await writeSwState(stateObj);

      await notifyClientsOfFired(fired, [itemLog]);

      let hasFocusedClient = false;
      try {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        hasFocusedClient = clients.some(c => c.focused || c.visibilityState === "visible");
      } catch {}

      if (!hasFocusedClient) {
        await self.registration.showNotification(payload.title, {
          body: payload.body || "",
          tag,
          icon: "assets/icon.png",
          badge: "assets/icon.png",
          renotify: false,
          data: { url: payload.url || "./index.html", key: tag }
        });
      }
    })()
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (
    u.origin !== location.origin ||
    u.pathname.startsWith("/__/auth/") ||
    u.searchParams.has("apiKey") ||
    u.searchParams.has("code") ||
    u.searchParams.has("state")
  ) {
    return;
  }

  const isNavigation = e.request.mode === "navigate" || (e.request.headers.get("accept") || "").includes("text/html");

  if (isNavigation) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r && r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return r;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
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
