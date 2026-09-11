#!/usr/bin/env node
const net = require('net');

const TOP_PORTS = [
  80, 443, 8080, 8443, 8000, 8008, 8888, 3000,
  5000, 7001, 9000, 9443, 10443, 4443, 81, 82,
  8081, 8090, 8181, 9080, 9090, 9200, 9300, 5601,
  15672, 5672, 6379, 11211, 27017, 27018, 5432, 3306,
  1433, 1521, 9201, 5984, 7474, 7687, 21, 22,
  23, 25, 53, 110, 111, 135, 139, 143,
  389, 445, 465, 587, 636, 993, 995, 1723,
  2049, 2375, 2376, 2483, 2484, 3128, 3389, 5900,
  5985, 5986, 6000, 6443, 6667, 7000, 7070, 7443,
  7777, 8069, 8082, 8083, 8088, 8091, 8092, 8099,
  8123, 8200, 8300, 8500, 8600, 8834, 8880, 8983,
  9091, 9092, 9100, 9418, 9999, 10000, 10250, 10255,
  11371, 12443, 18080, 27019,
];

function usage() {
  process.stdout.write([
    'naabu-lite: local TCP connect port discovery',
    'flags: -json -silent -top-ports N -p ports -rate N -retries N -scan-type c',
    'input: newline-separated hosts on stdin',
    '',
  ].join('\n'));
}

function argValue(names, fallback = null) {
  for (const name of names) {
    const idx = process.argv.indexOf(name);
    if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  }
  return fallback;
}

function hasArg(names) {
  return names.some((name) => process.argv.includes(name));
}

function parsePorts() {
  const explicit = argValue(['-p', '-ports']);
  if (explicit) {
    return [...new Set(explicit.split(',').flatMap((part) => {
      const trimmed = part.trim();
      if (!trimmed) return [];
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map((n) => Number(n));
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 65535 || end < start) return [];
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
      }
      const port = Number(trimmed);
      return Number.isInteger(port) && port > 0 && port <= 65535 ? [port] : [];
    }))];
  }
  const top = Math.max(1, Math.min(Number(argValue(['-top-ports'], '100')) || 100, TOP_PORTS.length));
  return TOP_PORTS.slice(0, top);
}

function readStdin() {
  return new Promise((resolve) => {
    let body = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { body += chunk; });
    process.stdin.on('end', () => resolve(body));
  });
}

function normalizeTarget(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `tcp://${raw}`);
    const port = url.port ? Number(url.port) : null;
    return { host: url.hostname, ports: port ? [port] : null };
  } catch {
    const match = raw.match(/^([^:/\s]+):(\d+)$/);
    if (match) return { host: match[1], ports: [Number(match[2])] };
    return { host: raw.replace(/\/.*$/, ''), ports: null };
  }
}

function checkPort(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function runQueue(items, worker, concurrency) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(workers);
}

async function main() {
  if (hasArg(['--help', '-h'])) {
    usage();
    return;
  }

  const json = hasArg(['-json']);
  const ports = parsePorts();
  const retries = Math.max(1, Number(argValue(['-retries'], '1')) || 1);
  const timeoutMs = Math.max(300, Math.min(Number(argValue(['-timeout'], '1')) * 1000 || 1000, 5000));
  const concurrency = Math.max(1, Math.min(Number(argValue(['-c', '-concurrency'], '50')) || 50, 100));
  const input = await readStdin();
  const targets = [...new Map(input.split(/\r?\n/)
    .map(normalizeTarget)
    .filter((item) => item && item.host)
    .map((item) => [item.host + ':' + (item.ports || ports).join(','), item])).values()];

  const checks = targets.flatMap((target) => (target.ports || ports).map((port) => ({ host: target.host, port })));
  await runQueue(checks, async ({ host, port }) => {
    let open = false;
    for (let attempt = 0; attempt < retries && !open; attempt += 1) {
      open = await checkPort(host, port, timeoutMs);
    }
    if (!open) return;
    const row = { host, port, protocol: 'tcp' };
    process.stdout.write(json ? `${JSON.stringify(row)}\n` : `${host}:${port}\n`);
  }, concurrency);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
