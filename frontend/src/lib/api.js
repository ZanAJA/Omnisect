// Tiny API client — injects the API key on every request and surfaces 401s
// as a global event so the UI can prompt for re-entry.

import { storage } from './storage';
import { getDefaultApiBase } from './platform';

export function getApiBase() {
  return storage.getApiBaseUrl() || getDefaultApiBase();
}

export class AuthRequiredError extends Error {
  constructor() { super('api key required'); this.name = 'AuthRequiredError'; }
}

async function request(path, options = {}) {
  const apiKey = storage.getApiKey();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (apiKey) headers['X-API-Key'] = apiKey;

  const res = await fetch(`${getApiBase()}${path}`, { ...options, headers });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('omnisect:auth-required'));
    throw new AuthRequiredError();
  }
  return res;
}

export const api = {
  get base() { return getApiBase(); },

  async health() {
    const r = await fetch(`${getApiBase()}/api/health`).catch(() => null);
    return !!r?.ok;
  },

  async toolStatus(refresh = false) {
    const r = await fetch(`${getApiBase()}/api/health/tools${refresh ? '?refresh=1' : ''}`);
    if (!r.ok) throw new Error('tool check failed');
    return r.json();
  },

  async startScan(domain, config = {}, startUrl = null) {
    const body = { domain, target: domain, ...(config || {}) };
    if (startUrl) body.startUrl = startUrl;
    const r = await request('/api/scan/full', { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  },

  async getStatus(jobId) {
    const r = await request(`/api/scan/status/${jobId}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  },

  async cancelScan(jobId) {
    const r = await request(`/api/scan/${jobId}`, { method: 'DELETE' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  },

  async getHistory(target = '', limit = 50) {
    const qs = new URLSearchParams();
    if (target) qs.set('target', target);
    if (limit) qs.set('limit', String(limit));
    const q = qs.toString();
    const r = await request(`/api/scan/history${q ? `?${q}` : ''}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },

  async getSnapshot(jobId) {
    const r = await request(`/api/scan/snapshot/${jobId}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  },

  async deleteSnapshot(jobId) {
    const r = await request(`/api/scan/snapshot/${jobId}`, { method: 'DELETE' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  },

  async getTargetSettings(target) {
    const r = await request(`/api/scan/settings/${encodeURIComponent(target)}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  },

  async saveTargetSettings(target, body) {
    const r = await request(`/api/scan/settings/${encodeURIComponent(target)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  },

  async deleteTargetSettings(target) {
    const r = await request(`/api/scan/settings/${encodeURIComponent(target)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  },

  async updateFinding(jobId, findingId, patch) {
    const r = await request(`/api/scan/finding/${jobId}/${findingId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  },

  async getScope() {
    const r = await request('/api/scope');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },

  async saveScope(scope) {
    const r = await request('/api/scope', { method: 'PUT', body: JSON.stringify(scope) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  },

  // Header-only auth — never put the long-lived API key in the query string.
  reportUrl(jobId, format) {
    const qs = new URLSearchParams();
    if (format) qs.set('format', format);
    const q = qs.toString();
    return `${getApiBase()}/api/report/${jobId}${q ? `?${q}` : ''}`;
  },

  async createEventsTicket(jobId) {
    const r = await request(`/api/scan/events/${jobId}/ticket`, { method: 'POST' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  },

  // SSE URL uses a short-lived ticket (EventSource cannot send headers).
  eventsUrl(jobId, ticket) {
    const qs = ticket ? `?ticket=${encodeURIComponent(ticket)}` : '';
    return `${getApiBase()}/api/scan/events/${jobId}${qs}`;
  },
};
