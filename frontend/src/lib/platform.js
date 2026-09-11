// Runtime detection for web / Tauri desktop / Capacitor mobile.

export function getRuntime() {
  if (typeof window === 'undefined') return 'web';
  if (window.__TAURI_INTERNALS__ || window.__TAURI__) return 'desktop';
  if (window.Capacitor?.isNativePlatform?.()) return 'mobile';
  return 'web';
}

export function isNativeShell() {
  const runtime = getRuntime();
  return runtime === 'desktop' || runtime === 'mobile';
}

/** Native shells need an absolute API URL (no Vite proxy). */
export function needsAbsoluteApi() {
  return isNativeShell() || Boolean(import.meta.env.VITE_API_URL);
}

export function getDefaultApiBase() {
  if (import.meta.env.VITE_API_URL) {
    return String(import.meta.env.VITE_API_URL).replace(/\/$/, '');
  }
  if (isNativeShell()) return 'http://127.0.0.1:3001';
  return '';
}
