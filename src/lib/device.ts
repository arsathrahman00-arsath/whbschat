export function getDeviceMetadata() {
  const userAgent = navigator.userAgent;
  let os_version = "unknown";

  if (/Windows NT (\d+\.\d+)/.test(userAgent)) {
    os_version = "Windows " + RegExp.$1;
  } else if (/Mac OS X ([\d_]+)/.test(userAgent)) {
    os_version = "macOS " + RegExp.$1.replace(/_/g, ".");
  } else if (/Linux/.test(userAgent)) {
    os_version = "Linux";
  } else if (/Android ([\d.]+)/.test(userAgent)) {
    os_version = "Android " + RegExp.$1;
  } else if (/iPhone OS ([\d_]+)/.test(userAgent)) {
    os_version = "iOS " + RegExp.$1.replace(/_/g, ".");
  }

  return {
    device_type: "web" as const,
    os_version,
    app_version: "1.0.0",
  };
}
