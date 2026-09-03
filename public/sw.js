// Heat Chat — Production PWA Service Worker
// Version: 1.0.0

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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
