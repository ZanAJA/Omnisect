#!/usr/bin/env node

const domain = process.argv.slice(2).find((arg) => !arg.startsWith('-'));

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('usage: urlscan <domain>');
  process.exit(0);
}

function isScopedUrl(value, root) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.username = '';
    url.password = '';
    const host = url.hostname.toLowerCase();
    return ['http:', 'https:'].includes(url.protocol) && (host === root || host.endsWith(`.${root}`))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

(async () => {
  const root = String(domain || '').trim().toLowerCase();
  if (!root) process.exit(0);

  const endpoint = `https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(root)}&size=100`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': 'Omnisect/1.0 authorized-recon' },
      signal: controller.signal,
    });
    if (!res.ok) process.exit(0);
    const json = await res.json();
    const urls = new Set();
    for (const result of json.results || []) {
      for (const value of [result?.page?.url, result?.task?.url]) {
        const scoped = isScopedUrl(value, root);
        if (scoped) urls.add(scoped);
      }
    }
    console.log([...urls].join('\n'));
  } catch {
    process.exit(0);
  } finally {
    clearTimeout(timer);
  }
})();
