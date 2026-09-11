#!/usr/bin/env node

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('usage: robots < newline-separated root urls');
  process.exit(0);
}

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdin += chunk; });
process.stdin.on('end', run);
if (process.stdin.isTTY) run();

function rootUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

async function fetchText(url, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function absolutize(root, value) {
  try {
    return new URL(value, root).toString();
  } catch {
    return null;
  }
}

async function run() {
  const roots = [...new Set(stdin.split(/\r?\n/).map(rootUrl).filter(Boolean))].slice(0, 20);
  const found = new Set();

  for (const root of roots) {
    const robots = await fetchText(`${root}/robots.txt`);
    for (const line of robots.split(/\r?\n/)) {
      const match = line.match(/^\s*(allow|disallow|sitemap):\s*(.+?)\s*$/i);
      if (!match) continue;
      const value = match[2].trim();
      if (!value || value === '/') continue;
      if (match[1].toLowerCase() === 'sitemap') {
        const sitemapUrl = absolutize(root, value);
        if (sitemapUrl) {
          found.add(sitemapUrl);
          const sitemap = await fetchText(sitemapUrl);
          const locs = sitemap.match(/<loc>\s*([^<]+)\s*<\/loc>/gi) || [];
          locs.map((loc) => loc.replace(/<\/?loc>/gi, '').trim()).forEach((url) => found.add(url));
        }
      } else {
        const url = absolutize(root, value);
        if (url) found.add(url);
      }
    }

    for (const sitemapUrl of [`${root}/sitemap.xml`, `${root}/sitemap_index.xml`]) {
      const sitemap = await fetchText(sitemapUrl);
      const locs = sitemap.match(/<loc>\s*([^<]+)\s*<\/loc>/gi) || [];
      locs.map((loc) => loc.replace(/<\/?loc>/gi, '').trim()).forEach((url) => found.add(url));
    }
  }

  console.log([...found].join('\n'));
}
