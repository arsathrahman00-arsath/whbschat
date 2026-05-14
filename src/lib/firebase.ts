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

/** Detect whether we are running inside a Capacitor native shell (e.g. Android APK). */
export function isNativePlatform(): boolean {
  try {
    const cap = (window as any)?.Capacitor;
    if (cap?.isNativePlatform) return !!cap.isNativePlatform();
    return !!cap?.isNative;
  } catch {
    return false;
  }
}

export type Platform = "web" | "android" | "ios";
export function detectPlatform(): Platform {
  try {
    const cap = (window as any)?.Capacitor;
    if (isNativePlatform()) {
      const p = cap?.getPlatform?.();
      if (p === "ios") return "ios";
      return "android";
    }
  } catch {}
  return "web";
}

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

function cacheToken(token: string) {
  try {
    if (!token) return;
    const cached = localStorage.getItem(TOKEN_CACHE_KEY);
    if (cached !== token) localStorage.setItem(TOKEN_CACHE_KEY, token);
  } catch {}
}

/**
 * Native (Capacitor) FCM token retrieval. Uses @capacitor/push-notifications.
 * Does NOT use VAPID or service worker — relies on the native Android Firebase config
 * (google-services.json) bundled with the APK.
 */
async function getNativeDeviceToken(): Promise<string> {
  try {
    const mod: any = await import("@capacitor/push-notifications");
    const PushNotifications = mod.PushNotifications;
    if (!PushNotifications) return "";

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      try { localStorage.removeItem(TOKEN_CACHE_KEY); } catch {}
      return "";
    }

    return await new Promise<string>((resolve) => {
      let settled = false;
      const finish = (t: string) => {
        if (settled) return;
        settled = true;
        resolve(t || "");
      };

      PushNotifications.addListener("registration", (token: { value: string }) => {
        cacheToken(token?.value || "");
        finish(token?.value || "");
      });
      PushNotifications.addListener("registrationError", (err: any) => {
        console.error("Native push registration error:", err);
        finish("");
      });

      PushNotifications.register().catch((err: any) => {
        console.error("PushNotifications.register failed:", err);
        finish("");
      });

      // Safety timeout — never block login/register
      setTimeout(() => finish(""), 8000);
    });
  } catch (error) {
    console.error("Failed to get native device token:", error);
    return "";
  }
}

/** Web FCM token retrieval via Firebase Web SDK + VAPID + service worker. */
async function getWebDeviceToken(): Promise<string> {
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
      try { localStorage.removeItem(TOKEN_CACHE_KEY); } catch {}
      return "";
    }

    const swRegistration = await registerServiceWorker();
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    cacheToken(token || "");
    return token || "";
  } catch (error) {
    console.error("Failed to get web device token:", error);
    return "";
  }
}

/**
 * Unified FCM device token retrieval. Picks the correct flow automatically:
 *   - Capacitor native (Android/iOS APK): @capacitor/push-notifications, no VAPID, no SW.
 *   - Web browsers (desktop/mobile/PWA): Firebase Web SDK + VAPID + service worker.
 * Never throws; returns "" on unsupported / denied / error so auth flows aren't blocked.
 */
export async function getDeviceToken(): Promise<string> {
  if (isNativePlatform()) return getNativeDeviceToken();
  return getWebDeviceToken();
}

/** Returns the last cached device token without prompting the user. */
export function getCachedDeviceToken(): string {
  try { return localStorage.getItem(TOKEN_CACHE_KEY) || ""; } catch { return ""; }
}

/** Force-refresh the device token (re-runs platform-appropriate flow and updates cache). */
export async function refreshDeviceToken(): Promise<string> {
  try { localStorage.removeItem(TOKEN_CACHE_KEY); } catch {}
  return getDeviceToken();
}

/** Subscribe to foreground push messages. Returns an unsubscribe fn. */
export async function onForegroundMessage(
  handler: (payload: any) => void,
): Promise<() => void> {
  try {
    if (isNativePlatform()) {
      const mod: any = await import("@capacitor/push-notifications");
      const PushNotifications = mod.PushNotifications;
      if (!PushNotifications) return () => {};
      const sub = await PushNotifications.addListener(
        "pushNotificationReceived",
        (notification: any) => handler(notification),
      );
      return () => { try { sub.remove?.(); } catch {} };
    }

    const supported = await isSupported().catch(() => false);
    if (!supported) return () => {};
    const messaging = getMessaging(app);
    return onMessage(messaging, handler);
  } catch {
    return () => {};
  }
}
