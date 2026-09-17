import { API_BASE_URL } from "../config/index.js";

/**
 * Utility to convert URL-safe base64 string to Uint8Array for PushManager
 */
export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Detect if device/browser supports Background Web Push
 */
export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Detect if running inside Nimiq Pay mobile WebView
 */
export function isInsideNimiqPay() {
  return typeof window !== "undefined" && Boolean(window.nimiqPay);
}

/**
 * Get current device notification permission state
 */
export function getDeviceNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission; // "default" | "granted" | "denied"
}

/**
 * Register Service Worker (/sw.js)
 */
export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.warn("[sw] Service worker registration failed:", err.message);
    return null;
  }
}

/**
 * Fetch VAPID Public Key from backend API
 */
export async function getVapidPublicKey() {
  try {
    const res = await fetch(`${API_BASE_URL}/notifications/vapid-public-key`);
    if (res.ok) {
      const data = await res.json();
      return data.publicKey;
    }
  } catch (err) {
    console.warn("[push] Failed to fetch VAPID public key:", err.message);
  }
  return null;
}

/**
 * Subscribe user to background device push notifications
 */
export async function subscribeToDeviceNotifications(walletAddress) {
  if (!isPushSupported()) {
    throw new Error("Device push notifications are not supported in this environment.");
  }
  if (!walletAddress) {
    throw new Error("Wallet address is required to register notification preferences.");
  }

  // 1. Request user permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { success: false, permission, status: "denied" };
  }

  // 2. Register Service Worker
  const reg = await registerServiceWorker();
  if (!reg) {
    throw new Error("Failed to initialize Service Worker.");
  }

  // 3. Fetch VAPID Key
  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) {
    throw new Error("Could not retrieve push server encryption key.");
  }

  // 4. Subscribe to PushManager
  const applicationServerKey = urlBase64ToUint8Array(vapidKey);
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  // 5. Send subscription to backend
  const subData = subscription.toJSON();
  const res = await fetch(`${API_BASE_URL}/notifications/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      subscription: {
        endpoint: subscription.endpoint,
        keys: subData.keys,
      },
      userAgent: navigator.userAgent,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to save push subscription on server.");
  }

  return { success: true, permission: "granted", subscription };
}

/**
 * Unsubscribe user from device push notifications
 */
export async function unsubscribeFromDeviceNotifications(walletAddress) {
  if (!isPushSupported()) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      await fetch(`${API_BASE_URL}/notifications/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          endpoint: subscription.endpoint,
        }),
      });
      await subscription.unsubscribe();
    }
    return true;
  } catch (err) {
    console.warn("[push] Unsubscribe failed:", err.message);
    return false;
  }
}

/**
 * Check if the current device has an active push subscription
 */
export async function hasActivePushSubscription() {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
}

/**
 * Sync notification preferences with backend
 */
export async function syncPreferencesWithBackend(walletAddress, prefs) {
  if (!walletAddress) return;
  try {
    await fetch(`${API_BASE_URL}/notifications/preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress,
        preferences: prefs,
      }),
    });
  } catch (err) {
    console.warn("[push] Failed to sync preferences with backend:", err.message);
  }
}
