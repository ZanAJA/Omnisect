const express = require('express');
const router = express.Router();
const { loadScope, saveScope, isInScope } = require('../utils/scope');

router.get('/', (req, res) => {
  res.json(loadScope());
});

router.put('/', (req, res) => {
  const { allowed, blocked } = req.body || {};
  if (allowed && !Array.isArray(allowed)) return res.status(400).json({ error: 'allowed must be an array' });
  if (blocked && !Array.isArray(blocked)) return res.status(400).json({ error: 'blocked must be an array' });
  const saved = saveScope({ allowed: allowed || [], blocked: blocked || [] });
  res.json(saved);
});

router.post('/check', (req, res) => {
  const { domain } = req.body || {};
  if (!domain) return res.status(400).json({ error: 'domain is required' });
  res.json(isInScope(domain));
});

module.exports = router;
