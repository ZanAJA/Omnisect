// SSRF protection — refuses any target that resolves to a private/loopback/cloud-metadata IP.
// Used by all scan + recon endpoints before invoking external tools.

const dns = require('dns').promises;
const net = require('net');

const DOMAIN_RE = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})+$/;

const PRIVATE_V4 = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^224\./,
  /^240\./,
];

const PRIVATE_V6 = [
  /^::1$/i,
  /^::$/,
  /^fe80:/i,
  /^fc/i,
  /^fd/i,
  /^ff/i, // multicast
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'ip6-localhost',
]);

function isValidDomain(domain) {
  if (typeof domain !== 'string') return false;
  if (domain.length < 3 || domain.length > 253) return false;
  return DOMAIN_RE.test(domain);
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return PRIVATE_V4.some((re) => re.test(ip));
  if (net.isIPv6(ip)) return PRIVATE_V6.some((re) => re.test(ip));
  return false;
}

async function isSafeTarget(domain) {
  if (!isValidDomain(domain)) {
    return { safe: false, reason: 'invalid domain format' };
  }
  const lower = domain.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) {
    return { safe: false, reason: `blocked hostname (${lower})` };
  }
  if (net.isIP(lower)) {
    return { safe: false, reason: 'raw IPs not allowed — supply a domain' };
  }

  let addresses;
  try {
    addresses = await dns.lookup(domain, { all: true });
  } catch (err) {
    return { safe: false, reason: `cannot resolve domain: ${err.code || err.message}` };
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr.address)) {
      return { safe: false, reason: `resolves to private/internal IP ${addr.address}` };
    }
  }

  return { safe: true, addresses: addresses.map((a) => a.address) };
}

function safeTargetMiddleware(req, res, next) {
  const domain =
    req.body?.domain ||
    req.body?.target ||
    req.params?.domain;

  if (!domain) return next();

  isSafeTarget(domain)
    .then(({ safe, reason }) => {
      if (!safe) return res.status(400).json({ error: `target rejected — ${reason}` });
      next();
    })
    .catch(next);
}

module.exports = { isSafeTarget, isValidDomain, isPrivateIp, safeTargetMiddleware };
