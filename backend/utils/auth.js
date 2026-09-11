// Lightweight API-key auth. Key is auto-generated on first boot and persisted.
// Set DISABLE_AUTH=true env to bypass (dev only — never outside local).

const path = require('path');
const crypto = require('crypto');
const { safeJsonRead, atomicWrite, ROOT } = require('./storage');

const AUTH_FILE = path.join(ROOT, 'auth.json');

// Short-lived SSE tickets: ticket -> { jobId, exp }
const sseTickets = new Map();
const TICKET_TTL_MS = 60_000;

function getOrCreateApiKey() {
  const existing = safeJsonRead(AUTH_FILE, null);
  if (existing?.apiKey) return existing.apiKey;
  const key = crypto.randomBytes(32).toString('hex');
  atomicWrite(AUTH_FILE, { apiKey: key, createdAt: new Date().toISOString() });
  return key;
}

function apiKeyFingerprint(key) {
  if (!key || key.length < 4) return '????';
  return key.slice(-4);
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function purgeExpiredTickets() {
  const now = Date.now();
  for (const [t, meta] of sseTickets) {
    if (meta.exp <= now) sseTickets.delete(t);
  }
}

function createSseTicket(jobId) {
  purgeExpiredTickets();
  const ticket = crypto.randomBytes(24).toString('hex');
  const exp = Date.now() + TICKET_TTL_MS;
  sseTickets.set(ticket, { jobId: String(jobId), exp });
  return { ticket, expiresAt: new Date(exp).toISOString(), ttlMs: TICKET_TTL_MS };
}

function consumeSseTicket(ticket, jobId) {
  purgeExpiredTickets();
  if (!ticket || !jobId) return false;
  const meta = sseTickets.get(ticket);
  if (!meta) return false;
  if (meta.jobId !== String(jobId)) return false;
  if (meta.exp <= Date.now()) {
    sseTickets.delete(ticket);
    return false;
  }
  // One-time use
  sseTickets.delete(ticket);
  return true;
}

function requireApiKey(req, res, next) {
  if (process.env.DISABLE_AUTH === 'true') return next();

  const headerKey = req.headers['x-api-key'];
  const expected = getOrCreateApiKey();
  if (headerKey && safeEqual(String(headerKey), expected)) return next();

  // SSE EventSource cannot set headers — accept a short-lived one-time ticket only.
  // Mounted at /api, so path looks like /scan/events/:jobId
  const m = req.path.match(/^\/scan\/events\/([^/]+)$/);
  if (req.method === 'GET' && m && consumeSseTicket(req.query.ticket, m[1])) {
    return next();
  }

  return res.status(401).json({ error: 'invalid or missing api key' });
}

module.exports = {
  getOrCreateApiKey,
  apiKeyFingerprint,
  requireApiKey,
  createSseTicket,
  consumeSseTicket,
};
