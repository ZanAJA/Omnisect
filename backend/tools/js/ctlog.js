#!/usr/bin/env node

const domain = process.argv.slice(2).find((arg) => !arg.startsWith('-'));

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('usage: ctlog <domain>');
  process.exit(0);
}

function cleanHost(value, root) {
  const host = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\*\./, '')
    .replace(/\.$/, '');
  if (!host) return null;
  if (host === root || host.endsWith(`.${root}`)) return host;
  return null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const root = cleanHost(domain, domain);
  if (!root) process.exit(0);

  const hosts = new Set([root]);
  const queries = [
    `https://crt.sh/?q=${encodeURIComponent(root)}&output=json`,
    `https://crt.sh/?q=${encodeURIComponent(`%.${root}`)}&output=json`,
  ];

  for (const url of queries) {
    const rows = await fetchJson(url);
    for (const row of Array.isArray(rows) ? rows : []) {
      const values = String(row.name_value || row.common_name || '').split(/\s+/);
      for (const value of values) {
        const host = cleanHost(value, root);
        if (host) hosts.add(host);
      }
    }
  }

  console.log([...hosts].sort().join('\n'));
})();
