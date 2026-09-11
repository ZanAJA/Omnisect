// File-based JSON persistence — zero native deps, survives restart.
// Each job lives at data/jobs/<id>.json; scope + auth live as single files.

const fs = require('fs');
const path = require('path');

const { getDataDir } = require('./paths');

const ROOT = getDataDir();
const JOBS_DIR = path.join(ROOT, 'jobs');
const TARGET_SETTINGS_FILE = path.join(ROOT, 'target-settings.json');

fs.mkdirSync(JOBS_DIR, { recursive: true });

function safeJsonRead(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function atomicWrite(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function jobPath(id) {
  return path.join(JOBS_DIR, `${id}.json`);
}

function saveJob(job) {
  atomicWrite(jobPath(job.id), job);
}

function loadJob(id) {
  return safeJsonRead(jobPath(id), null);
}

function listJobs() {
  return fs.readdirSync(JOBS_DIR)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))
    .map((f) => safeJsonRead(path.join(JOBS_DIR, f), null))
    .filter(Boolean);
}

function deleteJob(id) {
  const p = jobPath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function findLatestJobForTarget(target) {
  const jobs = listJobs()
    .filter((j) => j.target === target && j.status === 'completed')
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  return jobs[0] || null;
}

function cleanString(value, limit = 2000) {
  return String(value || '').trim().slice(0, limit);
}

function boundedNumberOrNull(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  return Number.isFinite(Number(value)) ? Math.min(Math.max(Number(value), min), max) : null;
}

function sanitizeTargetSettings(settings = {}) {
  const tools = settings.config?.tools && typeof settings.config.tools === 'object'
    ? Object.fromEntries(
      Object.entries(settings.config.tools)
        .filter(([key]) => /^[a-z0-9_-]+$/i.test(key))
        .map(([key, value]) => [key, value !== false]),
    )
    : {};

  const headers = Array.isArray(settings.auth?.headers)
    ? settings.auth.headers
      .map((header) => ({
        name: cleanString(header?.name, 120),
        value: cleanString(header?.value, 4000),
      }))
      .filter((header) => header.name && header.value)
      .slice(0, 20)
    : [];

  return {
    config: {
      threads: boundedNumberOrNull(settings.config?.threads, 1, 500),
      aggressive: typeof settings.config?.aggressive === 'boolean' ? settings.config.aggressive : null,
      adaptivePlanning: typeof settings.config?.adaptivePlanning === 'boolean'
        ? settings.config.adaptivePlanning
        : null,
      surfaceMaxPages: boundedNumberOrNull(settings.config?.surfaceMaxPages, 1, 50),
      surfaceSecondaryHosts: boundedNumberOrNull(settings.config?.surfaceSecondaryHosts, 0, 10),
      smartMaxEndpoints: boundedNumberOrNull(settings.config?.smartMaxEndpoints, 25, 1000),
      smartMaxRequests: boundedNumberOrNull(settings.config?.smartMaxRequests, 100, 10000),
      tools,
    },
    auth: {
      headers,
      cookie: cleanString(settings.auth?.cookie, 8000),
    },
    notifications: {
      webhookUrl: cleanString(settings.notifications?.webhookUrl, 2000),
      highSeverityOnly: settings.notifications?.highSeverityOnly !== false,
    },
  };
}

function settingsKey(target) {
  return cleanString(target, 500).toLowerCase();
}

function loadAllTargetSettings() {
  const all = safeJsonRead(TARGET_SETTINGS_FILE, {});
  return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
}

function loadTargetSettings(target) {
  const all = loadAllTargetSettings();
  return sanitizeTargetSettings(all[settingsKey(target)] || {});
}

function saveTargetSettings(target, settings) {
  const key = settingsKey(target);
  if (!key) return sanitizeTargetSettings({});
  const all = loadAllTargetSettings();
  all[key] = sanitizeTargetSettings(settings);
  atomicWrite(TARGET_SETTINGS_FILE, all);
  return all[key];
}

function deleteTargetSettings(target) {
  const key = settingsKey(target);
  const all = loadAllTargetSettings();
  delete all[key];
  atomicWrite(TARGET_SETTINGS_FILE, all);
}

module.exports = {
  saveJob, loadJob, listJobs, deleteJob, findLatestJobForTarget,
  loadAllTargetSettings, loadTargetSettings, saveTargetSettings, deleteTargetSettings, sanitizeTargetSettings,
  ROOT, JOBS_DIR, safeJsonRead, atomicWrite,
};
