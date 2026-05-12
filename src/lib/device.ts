export type DeviceType = "mobile" | "tablet" | "desktop" | "apk";

export interface DeviceMetadata {
  device_type: DeviceType;
  os_version: string;
  app_version: string;
}

const APP_VERSION = "1.0.0";

function detectOsVersion(ua: string): string {
  if (/Windows NT (\d+\.\d+)/.test(ua)) return "Windows " + RegExp.$1;
  if (/Mac OS X ([\d_]+)/.test(ua)) return "macOS " + RegExp.$1.replace(/_/g, ".");
  if (/Android ([\d.]+)/.test(ua)) return "Android " + RegExp.$1;
  if (/(iPhone|iPad|iPod) OS ([\d_]+)/.test(ua)) return "iOS " + RegExp.$2.replace(/_/g, ".");
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "unknown";
}

function detectDeviceType(ua: string): DeviceType {
  // Android WebView (APK wrapper) detection: contains "; wv)" token
  const isAndroidWebView = /Android/.test(ua) && /; wv\)/.test(ua);
  // Capacitor / Cordova native shells
  const isNativeShell =
    typeof (window as any).Capacitor !== "undefined" ||
    typeof (window as any).cordova !== "undefined";
  if (isAndroidWebView || isNativeShell) return "apk";

  const isIPad =
    /iPad/.test(ua) ||
    (/Macintosh/.test(ua) && typeof navigator !== "undefined" && (navigator as any).maxTouchPoints > 1);
  const isAndroidTablet = /Android/.test(ua) && !/Mobile/.test(ua);
  if (isIPad || isAndroidTablet) return "tablet";

  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry/i.test(ua)) return "mobile";

  return "desktop";
}

export function getDeviceMetadata(): DeviceMetadata {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return {
    device_type: detectDeviceType(ua),
    os_version: detectOsVersion(ua),
    app_version: APP_VERSION,
  };
}
