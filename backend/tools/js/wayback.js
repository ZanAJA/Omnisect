#!/usr/bin/env node

const domain = process.argv.slice(2).find((arg) => !arg.startsWith('-'));

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('usage: wayback <domain>');
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

  const endpoint = new URL('https://web.archive.org/cdx');
  endpoint.searchParams.set('url', `*.${root}/*`);
  endpoint.searchParams.set('output', 'json');
  endpoint.searchParams.set('fl', 'original');
  endpoint.searchParams.set('collapse', 'urlkey');
  endpoint.searchParams.set('filter', 'statuscode:200');
  endpoint.searchParams.set('limit', '2000');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) process.exit(0);
    const json = await res.json();
    const urls = new Set();
    for (const row of Array.isArray(json) ? json.slice(1) : []) {
      const value = Array.isArray(row) ? row[0] : row;
      const scoped = isScopedUrl(value, root);
      if (scoped) urls.add(scoped);
    }
    console.log([...urls].join('\n'));
  } catch {
    process.exit(0);
  } finally {
    clearTimeout(timer);
  }
})();
