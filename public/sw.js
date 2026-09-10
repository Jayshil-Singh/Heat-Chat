// Heat Chat — Production PWA Service Worker
// Version: 5.0.0 (Cache Busting + Fresh Shell Asset Pipeline)

const CACHE_NAME = "heat-chat-shell-v5";

const PRECACHE_RESOURCES = [
  "/offline",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

const OFFLINE_PAGE_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Offline — Heat Chat</title><style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#09090b;color:#fafafa;text-align:center;padding:1rem;}h1{margin-bottom:0.5rem;}p{color:#a1a1aa;}</style></head><body><div><h1>You are offline</h1><p>Reconnect to continue chatting.</p></div></body></html>';

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

// Activate: Clean up older cache versions belonging to Heat Chat and claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((k) => {
            const key = k;
            if ((k.startsWith("heat-chat-shell-") && k !== CACHE_NAME) || (key.startsWith("heat-chat-") && key !== CACHE_NAME)) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

function createOfflinePageResponse() {
  return new Response(OFFLINE_PAGE_HTML, {
    status: 503,
    statusText: "Service Unavailable",
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function createOfflineAssetResponse() {
  return new Response("Offline - heat-chat-shell-v5", {
    status: 503,
    statusText: "Service Unavailable",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

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

  // Authorization header bypass: never cache token-bearing requests
  if (request.headers && request.headers.get("authorization")) {
    return true;
  }

  // WebSocket upgrade header
  if (request.headers && request.headers.get("upgrade") === "websocket") {
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

  // 3. Internal Next.js API routes (/api/*, /api/notifications, /api/chat)
  if (
    url.pathname.startsWith("/api/notifications") ||
    url.pathname.startsWith("/api/chat") ||
    url.pathname.startsWith("/api/")
  ) {
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

// Fetch: Secure, fail-safe caching strategy
// CRITICAL INVARIANT: Every event.respondWith() path MUST resolve to a valid Response.
// Never return undefined, null, Response.error(), or unhandled rejected promises.
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Immediate bypass for sensitive or non-GET requests
  if (shouldBypassCache(request)) {
    return;
  }

  // 1. Navigation requests (HTML pages): Network-first with /offline or 503 fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response) return response;
          throw new Error("Network returned empty navigation response");
        })
        .catch(async () => {
          try {
            const cache = await caches.open(CACHE_NAME);
            const offlineResponse = await cache.match("/offline");
            if (offlineResponse) {
              return offlineResponse;
            }
          } catch (error) {
            // Cache lookup fallback
          }
          return createOfflinePageResponse();
        })
    );
    return;
  }

  const url = new URL(request.url);

  // 2. Safe static resources: Cache-first with network fallback and fail-safe Response
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
      caches
        .match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, responseToCache);
                });
              }
              return networkResponse || createOfflineAssetResponse();
            })
            .catch(() => {
              return createOfflineAssetResponse();
            });
        })
        .catch(() => {
          return createOfflineAssetResponse();
        })
    );
    return;
  }

  // 3. Default fallback for safe same-origin GET requests
  // Guarantees caches.match(request) resolving to undefined is converted to a valid Response
  event.respondWith(
    caches
      .match(request)
      .then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((networkResp) => {
            if (networkResp) return networkResp;
            return createOfflineAssetResponse();
          })
          .catch(() => {
            return createOfflineAssetResponse();
          });
      })
      .catch(() => {
        return createOfflineAssetResponse();
      })
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

function arrayBufferToBase64(buffer) {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Push Event Listener with Foreground/Background push detection
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
  const notificationId = payload.notificationId || data.notificationId || "general";
  const conversationId = payload.conversationId || data.conversationId;
  const senderId = payload.senderId || data.senderId;
  const eventType = payload.type || payload.eventType || data.eventType || "message";
  const targetUrl = sanitizeTargetUrl(payload.url || data.url);

  const options = {
    body,
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/badge-72.png",
    tag: conversationId ? `chat-${conversationId}` : `heat-chat-${notificationId}`,
    renotify: true,
    data: {
      url: targetUrl,
      notificationId,
      conversationId,
      senderId,
      eventType,
      receivedAt: Date.now(),
      ...(data || {}),
    },
  };

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Check if a visible and focused Heat Chat client window exists
      const focusedClient = clientList.find(
        (c) => c.visibilityState === "visible" && (c.focused === true || c.focus)
      );

      if (focusedClient) {
        // Foreground client is active: post message to window and suppress redundant OS notification banner
        focusedClient.postMessage({
          type: "PUSH_NOTIFICATION_RECEIVED",
          payload: {
            title,
            body,
            data: options.data,
          },
        });
        return;
      }

      // Application is backgrounded or closed: show OS push notification
      return self.registration.showNotification(title, options);
    })
  );
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

// Push Subscription Change Listener (Browser rotates push endpoint)
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        let newSubscription = event.newSubscription;
        if (!newSubscription) {
          const keyRes = await fetch("/api/notifications/push/public-key");
          if (keyRes.ok) {
            const { publicKey } = await keyRes.json();
            if (publicKey) {
              newSubscription = await self.registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: publicKey,
              });
            }
          }
        }

        if (newSubscription) {
          const p256dh = newSubscription.getKey ? arrayBufferToBase64(newSubscription.getKey("p256dh")) : "";
          const auth = newSubscription.getKey ? arrayBufferToBase64(newSubscription.getKey("auth")) : "";
          await fetch("/api/notifications/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpoint: newSubscription.endpoint,
              p256dh,
              auth,
              device_type: "desktop",
            }),
          });
        }

        if (event.oldSubscription && event.oldSubscription.endpoint) {
          await fetch("/api/notifications/push/subscriptions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: event.oldSubscription.endpoint }),
          });
        }
      } catch (err) {
        console.error("[SW] pushsubscriptionchange error:", err);
      }
    })()
  );
});
