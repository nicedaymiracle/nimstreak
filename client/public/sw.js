/**
 * NimStreak Service Worker
 * Handles real background Web Push notifications and actionable notification click routing.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "NimStreak Alert",
      body: event.data ? event.data.text() : "You have a new NimStreak update.",
    };
  }

  const title = data.title || "🔥 NimStreak";
  const options = {
    body: data.body || "Time to check in and protect your streak!",
    icon: data.icon || "/nimstreak-logo-192.png",
    badge: data.badge || "/nimstreak-logo-192.png",
    vibrate: [100, 50, 100],
    data: data.data || {},
    tag: (data.data && data.data.dedupKey) || "nimstreak-notification",
    renotify: false,
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  const targetUrl = notificationData.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If an open NimStreak tab exists, focus it and navigate
        for (const client of windowClients) {
          if (client.url && client.url.includes(self.location.origin) && "focus" in client) {
            if ("navigate" in client) {
              client.navigate(targetUrl);
            }
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
