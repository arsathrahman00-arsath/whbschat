import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyA6O-vnF8vlIxJF3Gw3AcEYw-BtrA4HEqE",
  authDomain: "loveable-wh-chat-box.firebaseapp.com",
  projectId: "loveable-wh-chat-box",
  storageBucket: "loveable-wh-chat-box.firebasestorage.app",
  messagingSenderId: "89987685679",
  appId: "1:89987685679:web:7b1de00386ecf17e8915da",
  measurementId: "G-4DMPER661D",
};

const VAPID_KEY =
  "BFtZ5qphlI4doDtLUN-uZ9HA7qa670ioxQEZFWnkxpDFfd2LL4mvFjdhDkZGWYG8NdTsi7RVyIODK1cmZrokBQU";

const app = initializeApp(firebaseConfig);

const TOKEN_CACHE_KEY = "whchat_device_token";

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator)) return undefined;
  try {
    // Reuse existing registration if present
    const existing = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  } catch (err) {
    console.warn("SW registration failed:", err);
    return undefined;
  }
}

/**
 * Request notification permission and fetch a Firebase Cloud Messaging token.
 * Returns "" when unsupported, denied, or on error — never throws — so login/register
 * flows are not blocked.
 */
export async function getDeviceToken(): Promise<string> {
  try {
    if (typeof window === "undefined") return "";
    if (!("Notification" in window)) return "";

    const supported = await isSupported().catch(() => false);
    if (!supported) return "";

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      // Drop any stale cached token if user revoked permission
      try { localStorage.removeItem(TOKEN_CACHE_KEY); } catch {}
      return "";
    }

    const swRegistration = await registerServiceWorker();
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    if (token) {
      try {
        const cached = localStorage.getItem(TOKEN_CACHE_KEY);
        if (cached !== token) localStorage.setItem(TOKEN_CACHE_KEY, token);
      } catch {}
    }
    return token || "";
  } catch (error) {
    console.error("Failed to get device token:", error);
    return "";
  }
}

/** Returns the last cached device token without prompting the user. */
export function getCachedDeviceToken(): string {
  try { return localStorage.getItem(TOKEN_CACHE_KEY) || ""; } catch { return ""; }
}

/** Subscribe to foreground push messages. Returns an unsubscribe fn. */
export async function onForegroundMessage(
  handler: (payload: any) => void,
): Promise<() => void> {
  try {
    const supported = await isSupported().catch(() => false);
    if (!supported) return () => {};
    const messaging = getMessaging(app);
    return onMessage(messaging, handler);
  } catch {
    return () => {};
  }
}
