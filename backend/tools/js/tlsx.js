#!/usr/bin/env node
const net = require('net');
const tls = require('tls');

function usage() {
  process.stdout.write([
    'tlsx-lite: local TLS certificate metadata collector',
    'flags: -json -silent -timeout seconds -c concurrency',
    'input: newline-separated hosts or host:port pairs on stdin',
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
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `tls://${raw}`);
    const fallback = url.protocol === 'https:' ? 443 : 443;
    return { host: url.hostname, port: Number(url.port || fallback) };
  } catch {
    const match = raw.match(/^([^:/\s]+):(\d+)$/);
    if (match) return { host: match[1], port: Number(match[2]) };
    return { host: raw.replace(/\/.*$/, ''), port: 443 };
  }
}

function parseSubjectAltName(value) {
  if (!value) return [];
  return [...new Set(String(value)
    .split(',')
    .map((part) => part.trim().replace(/^DNS:/i, ''))
    .filter(Boolean))];
}

function probeTls({ host, port }, timeoutMs) {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host,
      port,
      servername: net.isIP(host) ? undefined : host,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    });

    let settled = false;
    const finish = (row) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(row);
    };

    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate(true) || {};
      const cipher = socket.getCipher?.() || {};
      finish({
        host,
        port,
        subject_cn: cert.subject?.CN || '',
        issuer_cn: cert.issuer?.CN || '',
        not_before: cert.valid_from || '',
        not_after: cert.valid_to || '',
        subject_an: parseSubjectAltName(cert.subjectaltname),
        tls_version: socket.getProtocol?.() || '',
        cipher: cipher.name || '',
      });
    });
    socket.once('timeout', () => finish(null));
    socket.once('error', () => finish(null));
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
  const timeoutMs = Math.max(500, Math.min(Number(argValue(['-timeout'], '4')) * 1000 || 4000, 15000));
  const concurrency = Math.max(1, Math.min(Number(argValue(['-c', '-concurrency'], '20')) || 20, 50));
  const input = await readStdin();
  const targets = [...new Map(input.split(/\r?\n/)
    .map(normalizeTarget)
    .filter((item) => item && item.host && item.port)
    .map((item) => [`${item.host}:${item.port}`, item])).values()];

  await runQueue(targets, async (target) => {
    const row = await probeTls(target, timeoutMs);
    if (!row) return;
    process.stdout.write(json ? `${JSON.stringify(row)}\n` : `${row.host}:${row.port}\n`);
  }, concurrency);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
