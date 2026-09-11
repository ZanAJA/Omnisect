const express = require('express');
const router = express.Router();
const { checkAllTools, getCachedToolStatus } = require('../utils/toolChecker');

// GET /api/health — basic liveness
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/health/tools — per-tool availability (rechecked on demand)
router.get('/health/tools', async (req, res) => {
  if (req.query.refresh === '1') {
    await checkAllTools();
  }
  const tools = getCachedToolStatus();
  const missing = Object.entries(tools).filter(([, ok]) => ok === false).map(([k]) => k);
  res.json({ tools, missing, allOk: missing.length === 0 });
});

module.exports = router;
