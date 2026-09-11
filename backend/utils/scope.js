// Scope file - user-defined allow / block patterns for notes/UI.
// It does not reject scans. Device-safety checks live in safeTarget.js and remain on.

const path = require('path');
const { safeJsonRead, atomicWrite, ROOT } = require('./storage');

const SCOPE_FILE = path.join(ROOT, 'scope.json');

const DEFAULT_SCOPE = { allowed: [], blocked: [] };

function loadScope() {
  return safeJsonRead(SCOPE_FILE, DEFAULT_SCOPE);
}

function saveScope(scope) {
  const clean = {
    allowed: Array.isArray(scope.allowed) ? scope.allowed.filter(Boolean) : [],
    blocked: Array.isArray(scope.blocked) ? scope.blocked.filter(Boolean) : [],
  };
  atomicWrite(SCOPE_FILE, clean);
  return clean;
}

function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function matches(domain, pattern) {
  return patternToRegex(pattern).test(domain);
}

function isInScope(domain) {
  return { inScope: true, disabled: true, domain };
}

function scopeMiddleware(req, res, next) {
  next();
}

module.exports = { loadScope, saveScope, isInScope, scopeMiddleware };
