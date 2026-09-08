// Heat Chat — Production PWA Service Worker
// Version: 2.0.0 (PWA Shell Caching + Offline Fallback + Phase 9 Web Push)

const CACHE_NAME = "heat-chat-shell-v3";

const PRECACHE_RESOURCES = [
  "/offline",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

// Install: Cache safe static shell resources
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_RESOURCES);
      })
      .catch((err) => {
        // Non-blocking in case of build-time variations
        console.warn("[SW] Pre-caching completed with notices:", err);
      })
  );
  self.skipWaiting();
});

// Activate: Clean up older cache versions and claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key.startsWith("heat-chat-") && key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

/**
 * Validates whether a request MUST bypass SW caching.
 * Explicitly protects Supabase, Auth, Storage, Realtime, WebSockets,
 * API routes, and private user chat data from ever being cached.
 */
function shouldBypassCache(request) {
  // Only cache GET requests
  if (request.method !== "GET") {
    return true;
  }

  const url = new URL(request.url);

  // 1. WebSocket / Realtime protocols
  if (url.protocol === "ws:" || url.protocol === "wss:") {
    return true;
  }

  // 2. Supabase API endpoints & domains
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/rest/v1") ||
    url.pathname.startsWith("/auth/v1") ||
    url.pathname.startsWith("/storage/v1") ||
    url.pathname.startsWith("/realtime/v1")
  ) {
    return true;
  }

  // 3. Internal Next.js API routes (/api/*)
  if (url.pathname.startsWith("/api/")) {
    return true;
  }

  // 4. Any query parameters containing authentication, tokens, or signatures
  const search = url.search.toLowerCase();
  if (
    search.includes("token=") ||
    search.includes("apikey=") ||
    search.includes("signature=") ||
    search.includes("auth=")
  ) {
    return true;
  }

  // 5. Storage attachments / media buckets
  if (
    url.pathname.includes("/chat-attachments/") ||
    url.pathname.includes("/avatars/")
  ) {
    return true;
  }

  return false;
}

// Fetch: Secure caching strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Immediate bypass for sensitive or non-GET requests
  if (shouldBypassCache(request)) {
    return;
  }

  // Navigation requests (HTML pages): Network-first with /offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const offlineResponse = await cache.match("/offline");
        if (offlineResponse) {
          return offlineResponse;
        }
        return new Response(
          "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>Offline — Heat Chat</title><style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#09090b;color:#fafafa;text-align:center;padding:1rem;}h1{margin-bottom:0.5rem;}p{color:#a1a1aa;}</style></head><body><div><h1>You are offline</h1><p>Reconnect to continue chatting.</p></div></body></html>",
          {
            status: 503,
            statusText: "Service Unavailable",
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            },
          }
        );
      })
    );
    return;
  }

  const url = new URL(request.url);

  // Safe static resources: Cache-first
  // Matches Next.js static chunks, icons, manifest, favicon, and fonts
  const isStaticAsset =
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/favicon.ico" ||
      url.pathname === "/manifest.webmanifest" ||
      url.pathname === "/manifest.json" ||
      url.pathname.endsWith(".woff2") ||
      url.pathname.endsWith(".woff") ||
      url.pathname.endsWith(".ttf"));

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Default fallback for safe same-origin GET requests
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ============================================================================
// Phase 9 Web Push Notifications & Click Handling (PRESERVED)
// ============================================================================

/**
 * Validates target internal route to prevent open redirect attacks
 */
function sanitizeTargetUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "/chat";
  }

  const trimmed = rawUrl.trim();

  // Strictly require leading '/' and forbid protocol-relative '//' or backslashes
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return "/chat";
  }

  // Reject javascript: or data: URIs
  if (
    trimmed.toLowerCase().startsWith("/%2f") ||
    trimmed.toLowerCase().includes("javascript:") ||
    trimmed.toLowerCase().includes("data:") ||
    trimmed.includes("\\")
  ) {
    return "/chat";
  }

  return trimmed;
}

// Push Event Listener
self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (err) {
    try {
      payload = { title: "Heat Chat", body: event.data.text() };
    } catch {
      payload = { title: "Heat Chat", body: "You have a new notification" };
    }
  }

  const title = typeof payload.title === "string" ? payload.title.slice(0, 128) : "Heat Chat";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 256) : "New notification";
  const data = payload.data || {};
  const notificationId = data.notificationId || "general";
  const targetUrl = sanitizeTargetUrl(data.url);

  const options = {
    body,
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-192.png",
    tag: `heat-chat-${notificationId}`,
    renotify: true,
    data: {
      url: targetUrl,
      notificationId,
      receivedAt: Date.now(),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click Listener
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = sanitizeTargetUrl(data.url);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If a window is already open, focus it and navigate
        for (const client of clientList) {
          if (client.url && "focus" in client) {
            client.focus();
            if ("navigate" in client) {
              return client.navigate(targetUrl);
            }
            return client;
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
