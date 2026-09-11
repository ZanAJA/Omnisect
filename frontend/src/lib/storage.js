// Browser localStorage with safe defaults.

const KEYS = {
  API_KEY:        'omnisect:apiKey',
  API_BASE:       'omnisect:apiBase',
  STATE:          'omnisect:state',
  REDUCED_MOTION: 'omnisect:reducedMotion',
  SCAN_CONFIG:    'omnisect:scanConfig',
};

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota / disabled */ }
}

export const storage = {
  getApiKey()    { return localStorage.getItem(KEYS.API_KEY) || ''; },
  setApiKey(k)   { localStorage.setItem(KEYS.API_KEY, k); },
  clearApiKey()  { localStorage.removeItem(KEYS.API_KEY); },

  getApiBaseUrl() {
    return (localStorage.getItem(KEYS.API_BASE) || '').replace(/\/$/, '');
  },
  setApiBaseUrl(url) {
    const cleaned = String(url || '').trim().replace(/\/$/, '');
    if (cleaned) localStorage.setItem(KEYS.API_BASE, cleaned);
    else localStorage.removeItem(KEYS.API_BASE);
  },

  loadState()    { return safeGet(KEYS.STATE, { targets: [], activeTarget: null, jobIds: {} }); },
  saveState(s)   { safeSet(KEYS.STATE, s); },

  loadConfig()   { return safeGet(KEYS.SCAN_CONFIG, null); },
  saveConfig(c)  { safeSet(KEYS.SCAN_CONFIG, c); },

  loadReducedMotion() {
    const raw = localStorage.getItem(KEYS.REDUCED_MOTION);
    if (raw == null) return null;
    return raw === 'true';
  },
  saveReducedMotion(b) { localStorage.setItem(KEYS.REDUCED_MOTION, String(Boolean(b))); },
};
