const express = require('express');
const router = express.Router();
const { runTool } = require('../utils/toolRunner');

router.post('/subdomains', async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain is required' });
  try {
    const { stdout } = await runTool('subfinder', ['-d', domain, '-json', '-silent'], { timeout: 120000 });
    const subdomains = stdout.split('\n').filter((l) => l.trim()).map((l) => {
      try { return JSON.parse(l).host; } catch { return l.trim(); }
    }).filter(Boolean);
    res.json({ domain, subdomains, count: subdomains.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/probe', async (req, res) => {
  const { hosts } = req.body;
  if (!Array.isArray(hosts)) return res.status(400).json({ error: 'hosts array is required' });
  try {
    const { stdout } = await runTool('httpx', ['-json', '-silent', '-threads', '50'], {
      timeout: 120000, stdin: hosts.join('\n'),
    });
    const liveHosts = stdout.split('\n').filter((l) => l.trim()).map((l) => {
      try {
        const p = JSON.parse(l);
        return { url: p.url, status: p.status_code, title: p.title || '', tech: p.tech || [] };
      } catch { return null; }
    }).filter(Boolean);
    res.json({ liveHosts, count: liveHosts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/crawl', async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain is required' });
  try {
    const { stdout } = await runTool(
      'gau',
      ['--blacklist', 'png,jpg,gif,css,woff,svg,ico,ttf,eot,mp4,mp3', domain],
      { timeout: 90000 }
    );
    const endpoints = stdout.split('\n')
      .filter((l) => l.trim() && l.startsWith('http'))
      .slice(0, 500);
    res.json({ domain, endpoints, count: endpoints.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/technologies', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const { stdout } = await runTool(
      'nuclei',
      ['-u', url, '-t', 'technologies/', '-json', '-silent', '-timeout', '10'],
      { timeout: 60000 }
    );
    const technologies = stdout.split('\n').filter((l) => l.trim()).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    res.json({ url, technologies, count: technologies.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
