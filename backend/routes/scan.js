const express = require('express');
const dns = require('dns').promises;
const router = express.Router();
const { runTool, injectPayload } = require('../utils/toolRunner');
const { createSseTicket } = require('../utils/auth');
const {
  createJob, getJob, updateJob, setPhase,
  addFinding, updateFinding, addError, trackProcess, killJob, deleteJob,
  runningCount, publicView, listRawJobs, TERMINAL_STATUSES,
} = require('../utils/jobManager');
const sse = require('../utils/sseManager');
const storage = require('../utils/storage');
const { applyFingerprintsAndDiff } = require('../utils/findingId');
const logger = require('../utils/logger');
const { checkAllTools } = require('../utils/toolChecker');
const { isSafeTarget } = require('../utils/safeTarget');
const {
  buildAttackGraph,
  buildToolPlan,
  loadRuleDatabase,
  mergeSurfaceReports,
  summarizeAttackSurface,
  surfaceEndpoints,
} = require('../utils/attackSurfacePlanner');
const { recordPlannerOutcome, recordTriageFeedback } = require('../utils/learningRecorder');
const { getWordlist } = require('../utils/paths');

const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_JOBS || 3);
const pendingQueue = [];

function isTerminal(job) {
  return TERMINAL_STATUSES.has(job?.status);
}

// Scan tunables. Bump these if you want broader (slower) coverage.
const CAPS = {
  endpoints:    2000,  // total endpoints kept after gau
  nucleiUrls:   250,   // URLs handed to nuclei (was 50)
  sqliUrls:     300,   // URLs with query string tested for SQLi (was 30)
  xssUrls:      150,   // URLs tested for XSS (was 30)
  idorUrls:     60,    // URLs tested for IDOR (was 15)
  paramsPerUrl: 6,     // params tested per URL
};

const GAU_TIMEOUT_MS = Number(process.env.GAU_TIMEOUT_MS || 180000);
const GAU_HTTP_TIMEOUT_SECONDS = Number(process.env.GAU_HTTP_TIMEOUT_SECONDS || 20);
const GAU_THREADS = Number(process.env.GAU_THREADS || 6);
const FFUF_WORDLIST = getWordlist('content-small.txt');

const SQLI_ERROR_PATTERNS = [
  /you have an error in your sql syntax/i,
  /warning.*mysql/i,
  /unclosed quotation mark/i,
  /quoted string not properly terminated/i,
  /ORA-\d{4,5}/,
  /Microsoft SQL Server.*error/i,
  /SQLSTATE\[/i,
  /sqlite.*exception/i,
  /pg_query\(\)/i,
  /supplied argument is not a valid MySQL/i,
  /mysql_fetch_array/i,
  /PostgreSQL.*ERROR/i,
  /MariaDB server version/i,
  /OLE DB Provider/i,
  /JDBC.*Exception/i,
  /System\.Data\.SqlClient\.SqlException/i,
  /Npgsql\./i,
  /CLI Driver.*DB2/i,
];

// Non-destructive — variants of bare quotes / parentheses / comment terminators.
const SQLI_SAFE_PAYLOADS = ["'", '"', "')", '")', "';--", '";--', "' OR '1'='1"];
// Time-based blind templates (only used in aggressive mode). Each takes a seconds value.
const SQLI_TIMING_TEMPLATES = [
  (s) => `'+(SELECT(0)FROM(SELECT(SLEEP(${s})))a)+'`,
  (s) => `' AND (SELECT 1 FROM (SELECT(SLEEP(${s})))a)--`,
  (s) => `' OR SLEEP(${s})--`,
  (s) => `1; SELECT pg_sleep(${s})--`,
  (s) => `1)) WAITFOR DELAY '0:0:${s}'--`,
];

// XSS canaries — short unique strings + matchers. Cover tag-break, attribute-break,
// event-handler injection, javascript: URI context.
const XSS_CANARY = 'bH9X9';
const XSS_PAYLOADS = [
  { p: `<${XSS_CANARY}>`,                            match: new RegExp(`<${XSS_CANARY}>`,         'i') },
  { p: `"><${XSS_CANARY}>`,                          match: new RegExp(`<${XSS_CANARY}>`,         'i') },
  { p: `'><${XSS_CANARY}>`,                          match: new RegExp(`<${XSS_CANARY}>`,         'i') },
  { p: `<img src=x onerror=${XSS_CANARY}()>`,        match: new RegExp(`onerror=${XSS_CANARY}`,   'i') },
  { p: `<svg onload=${XSS_CANARY}()>`,               match: new RegExp(`onload=${XSS_CANARY}`,    'i') },
  { p: `javascript:${XSS_CANARY}()`,                 match: new RegExp(`javascript:${XSS_CANARY}`,'i') },
];

// Install hints surfaced when a tool is missing — visible in the warnings panel.
const INSTALL_HINTS = {
  'surface-mapper': 'install the sibling CTF\\web-surface-mapper project or set SURFACE_MAPPER_BIN',
  subfinder: 'go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest',
  sublist3r: 'pip install sublist3r',
  dnsx:      'go install -v github.com/projectdiscovery/dnsx/cmd/dnsx@latest',
  naabu:     'go install -v github.com/projectdiscovery/naabu/v2/cmd/naabu@latest',
  nmap:      'install Nmap from https://nmap.org/download.html or your OS package manager',
  httpx:     'go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest',
  tlsx:      'go install -v github.com/projectdiscovery/tlsx/cmd/tlsx@latest',
  gau:       'go install -v github.com/lc/gau/v2/cmd/gau@latest',
  ffuf:      'go install github.com/ffuf/ffuf/v2@latest',
  katana:    'go install -v github.com/projectdiscovery/katana/cmd/katana@latest',
  nuclei:    'go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest && nuclei -update-templates',
  curl:      'install curl from your OS package manager',
};

const PHASE_LABELS = {
  surface: 'passive attack-surface mapping',
  subdomains: 'subdomain discovery',
  sublist3r: 'Sublist3r discovery',
  ctlog: 'certificate transparency discovery',
  dnsx: 'DNS validation',
  ports: 'port discovery',
  nmap: 'Nmap port discovery',
  probe: 'http probing',
  headers: 'security header checks',
  takeover: 'subdomain takeover checks',
  tls: 'TLS metadata',
  crawl: 'endpoint crawl',
  wayback: 'Wayback endpoint discovery',
  urlscan: 'urlscan endpoint discovery',
  robots: 'robots and sitemap discovery',
  ffuf: 'ffuf content discovery',
  katana: 'active crawl',
  technologies: 'technology fingerprinting',
  nuclei: 'nuclei scanning',
  sqli: 'SQL injection checks',
  xss: 'XSS checks',
  idor: 'IDOR checks',
};

const PLAN_TOOL_BY_PHASE = {
  surface: 'surfaceMapper',
  subdomains: 'subfinder',
  sublist3r: 'sublist3r',
  ctlog: 'ctlog',
  dnsx: 'dnsx',
  ports: 'naabu',
  nmap: 'nmap',
  probe: 'httpx',
  headers: 'headers',
  takeover: 'takeover',
  tls: 'tlsx',
  crawl: 'gau',
  wayback: 'wayback',
  urlscan: 'urlscan',
  robots: 'robots',
  ffuf: 'ffuf',
  katana: 'katana',
  technologies: 'nuclei',
  nuclei: 'nuclei',
  sqli: 'sqli',
  xss: 'xss',
  idor: 'idor',
};

async function getToolStatusSnapshot() {
  return checkAllTools();
}

function phaseEnabled(config, phase, toolPlan = null) {
  const tools = config?.tools || {};
  const toolName = PLAN_TOOL_BY_PHASE[phase] || phase;
  if (tools[toolName] === false) return false;

  if (config?.adaptivePlanning !== false && toolPlan) {
    if (toolPlan.decisions?.[toolName]?.selected === false) return false;
  }
  return true;
}

function phaseReadiness(config, tools, phase, command, toolPlan = null) {
  if (!phaseEnabled(config, phase, toolPlan)) {
    const toolName = PLAN_TOOL_BY_PHASE[phase] || phase;
    const plannedReason = toolPlan?.decisions?.[toolName]?.reason;
    return { run: false, reason: plannedReason ? 'planned' : 'disabled', detail: plannedReason || null };
  }
  if (tools[command] !== true) {
    return { run: false, reason: 'missing' };
  }
  return { run: true };
}

function markSkipped(jobId, phase, progress, message) {
  updateJob(jobId, { phase, progress });
  setPhase(jobId, phase, 'skipped');
  if (message) addError(jobId, message);
}

function missingMessage(command, phase) {
  const base = `${command}: unavailable - skipped ${PHASE_LABELS[phase] || phase}`;
  const hint = INSTALL_HINTS[command];
  return hint ? `${base}. Install: ${hint}` : base;
}

function mergeScanConfig(base = {}, targetConfig = {}) {
  const next = {
    ...base,
    ...targetConfig,
    tools: {
      ...(base.tools || {}),
      ...(targetConfig.tools || {}),
    },
  };
  if (targetConfig.threads === null || targetConfig.threads === undefined) next.threads = base.threads;
  if (targetConfig.aggressive === null || targetConfig.aggressive === undefined) next.aggressive = base.aggressive;
  if (targetConfig.adaptivePlanning === null || targetConfig.adaptivePlanning === undefined) {
    next.adaptivePlanning = base.adaptivePlanning;
  }
  for (const key of ['surfaceMaxPages', 'surfaceSecondaryHosts', 'smartMaxEndpoints', 'smartMaxRequests']) {
    if (targetConfig[key] === null || targetConfig[key] === undefined) next[key] = base[key];
  }
  return next;
}

function authHeaderArgs(auth = {}) {
  const args = [];
  for (const header of auth.headers || []) {
    if (!header?.name || !header?.value) continue;
    args.push('-H', `${header.name}: ${header.value}`);
  }
  if (auth.cookie) args.push('-H', `Cookie: ${auth.cookie}`);
  return args;
}

function surfaceAuthPayload(auth = {}) {
  const headers = {};
  for (const header of auth.headers || []) {
    if (header?.name && header?.value) headers[header.name] = header.value;
  }
  const cookie = String(auth.cookie || '');
  return Object.keys(headers).length || cookie ? JSON.stringify({ headers, cookie }) : null;
}

async function runSurfaceMapper(seed, settings = {}) {
  const maxPages = Math.max(1, Math.min(Number(settings.maxPages || 20), 50));
  const delayMs = Math.max(0, Math.min(Number(settings.delayMs || 200), 2000));
  const timeoutSeconds = Math.max(15, Math.min(Number(settings.timeoutSeconds || 90), 180));
  const authInput = surfaceAuthPayload(settings.auth || {});
  const args = [
    'scan', seed,
    '--format', 'json',
    '--max-pages', String(maxPages),
    '--delay-ms', String(delayMs),
    '--timeout-seconds', String(timeoutSeconds),
  ];
  if (authInput) args.push('--auth-stdin');
  const { stdout, stderr, code } = await runTool('surface-mapper', args, {
    timeout: (timeoutSeconds + 15) * 1000,
    onProcess: settings.onProcess,
    stdin: authInput || undefined,
  });
  if (code !== 0) {
    const detail = String(stderr || '').trim().slice(0, 300);
    throw new Error('exited with code ' + code + (detail ? ': ' + detail : ''));
  }
  return JSON.parse(stdout);
}

function shellQuote(value) {
  return `"${String(value || '').replace(/(["\\$`])/g, '\\$1')}"`;
}

function buildReproduceCurl(url, auth = {}) {
  if (!url) return null;
  const args = ['curl', '-i', '-L', '--max-time', '10', '-H', shellQuote('User-Agent: Mozilla/5.0')];
  for (const header of auth.headers || []) {
    if (!header?.name || !header?.value) continue;
    args.push('-H', shellQuote(`${header.name}: ${header.value}`));
  }
  if (auth.cookie) args.push('-H', shellQuote(`Cookie: ${auth.cookie}`));
  args.push(shellQuote(url));
  return args.join(' ');
}

function withEvidence(finding, auth = {}) {
  const url = finding.testUrl || finding.url;
  return {
    ...finding,
    reproduceCurl: finding.reproduceCurl || buildReproduceCurl(url, auth),
    evidenceDetails: {
      checkedUrl: url || null,
      originalUrl: finding.url || null,
      payload: finding.payload || null,
      testUrl: finding.testUrl || null,
      signal: finding.evidence || null,
    },
  };
}

function highImpactFindings(job) {
  return [
    ...(job.findings?.critical || []),
    ...(job.findings?.high || []),
  ];
}

function findingSummary(job) {
  const findings = job.findings || {};
  return {
    critical: findings.critical?.length || 0,
    high: findings.high?.length || 0,
    medium: findings.medium?.length || 0,
    low: findings.low?.length || 0,
    info: findings.info?.length || 0,
  };
}

async function sendWebhook(job) {
  const url = job?.targetSettings?.notifications?.webhookUrl;
  if (!url || typeof fetch !== 'function') return;

  const highFindings = highImpactFindings(job);
  const onlyHigh = job.targetSettings?.notifications?.highSeverityOnly !== false;
  if (onlyHigh && highFindings.length === 0) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'scan.completed',
        target: job.target,
        jobId: job.id,
        status: job.status,
        completedAt: job.completedAt,
        summary: findingSummary(job),
        highFindings: highFindings.slice(0, 20).map((finding) => ({
          id: finding.id,
          severity: finding.severity,
          type: finding.type,
          name: finding.name || finding.description,
          url: finding.url,
          isNew: finding.isNew === true,
        })),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    logger.warn({ err, jobId: job.id }, 'webhook notification failed');
  } finally {
    clearTimeout(timer);
  }
}

// Helper: mutate a single query parameter in a URL without disturbing the others.
function mutateParam(parsedUrl, key, value) {
  const clone = new URL(parsedUrl.toString());
  clone.searchParams.set(key, value);
  return clone.toString();
}

// Helper: return ~radius chars of context around a needle for evidence display.
function extractContext(body, needle, radius = 80) {
  const idx = body.indexOf(needle);
  if (idx === -1) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(body.length, idx + needle.length + radius);
  return body.substring(start, end).replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values, limit = Infinity) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const clean = String(value || '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function parseDnsxHosts(stdout) {
  return uniqueStrings(stdout.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed.host || parsed.input || parsed.a?.[0] || null;
    } catch {
      return trimmed;
    }
  }));
}

function parseNaabuPorts(stdout) {
  const seen = new Set();
  const out = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let item = null;
    try {
      const parsed = JSON.parse(trimmed);
      const host = parsed.host || parsed.hostname || parsed.input || parsed.ip;
      const port = Number(parsed.port || parsed.port_number);
      if (host && port) {
        item = {
          host: String(host),
          port,
          protocol: parsed.protocol || 'tcp',
          ip: parsed.ip && parsed.ip !== host ? String(parsed.ip) : undefined,
        };
      }
    } catch {
      const match = trimmed.match(/^(?:https?:\/\/)?([^:/\s]+):(\d+)$/i);
      if (match) {
        item = { host: match[1], port: Number(match[2]), protocol: 'tcp' };
      }
    }

    if (!item) continue;
    const key = `${item.host}:${item.port}:${item.protocol || 'tcp'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function mergeOpenPorts(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const item of list || []) {
      if (!item?.host || !item?.port) continue;
      const next = {
        ...item,
        host: String(item.host).toLowerCase(),
        port: Number(item.port),
        protocol: item.protocol || 'tcp',
      };
      const key = `${next.host}:${next.port}:${next.protocol}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(next);
    }
  }
  return out;
}

function parseNmapPorts(stdout) {
  const out = [];
  let currentHost = null;
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const grepableHost = trimmed.match(/^Host:\s+(\S+)/i);
    if (grepableHost) currentHost = grepableHost[1];

    const reportHost = trimmed.match(/^Nmap scan report for\s+(.+)$/i);
    if (reportHost) {
      const value = reportHost[1].trim();
      const named = value.match(/^(.+?)\s+\(([^)]+)\)$/);
      currentHost = (named ? named[1] : value).trim();
    }

    const portsIndex = trimmed.indexOf('Ports:');
    if (grepableHost && portsIndex !== -1) {
      for (const entry of trimmed.slice(portsIndex + 'Ports:'.length).split(',')) {
        const parts = entry.trim().split('/');
        const port = Number(parts[0]);
        const state = parts[1];
        const protocol = parts[2] || 'tcp';
        const service = parts[4] || undefined;
        if (!currentHost || !port || state !== 'open') continue;
        out.push({ host: currentHost, port, protocol, service });
      }
      continue;
    }

    const normalPort = trimmed.match(/^(\d+)\/(tcp|udp)\s+open\s+(\S+)?/i);
    if (currentHost && normalPort) {
      out.push({
        host: currentHost,
        port: Number(normalPort[1]),
        protocol: normalPort[2],
        service: normalPort[3] || undefined,
      });
    }
  }
  return mergeOpenPorts(out);
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return uniqueStrings(value);
  if (typeof value === 'string') {
    return uniqueStrings(value.split(',').map((part) => part.trim()));
  }
  return [];
}

function parseTlsxMetadata(stdout) {
  const seen = new Set();
  const out = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      const host = parsed.host || parsed.input || parsed.hostname || parsed.ip;
      if (!host) continue;
      const item = {
        host: String(host),
        port: parsed.port ? Number(parsed.port) : undefined,
        subject: parsed.subject_cn || parsed.subject || parsed['subject-cn'] || '',
        issuer: parsed.issuer_cn || parsed.issuer || parsed['issuer-cn'] || '',
        notBefore: parsed.not_before || parsed.notBefore || '',
        notAfter: parsed.not_after || parsed.notAfter || '',
        san: normalizeStringArray(parsed.subject_an || parsed.san || parsed.dns_names || parsed.domains),
        tlsVersion: parsed.tls_version || parsed.version || '',
        cipher: parsed.cipher || '',
      };
      const key = `${item.host}:${item.port || ''}:${item.subject}:${item.notAfter}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    } catch {
      // tlsx is expected to emit JSON with -json; ignore plain banner/noise lines.
    }
  }
  return out;
}

function parseKatanaEndpoints(stdout) {
  return uniqueStrings(stdout.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed.request?.endpoint || parsed.endpoint || parsed.url || parsed.fqdn || null;
    } catch {
      return trimmed.startsWith('http') ? trimmed : null;
    }
  }));
}

function parseGauEndpoints(stdout) {
  return uniqueStrings(
    stdout.split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('http')),
    CAPS.endpoints,
  );
}

function parseScopedHosts(stdout, target) {
  const root = String(target || '').toLowerCase();
  return uniqueStrings(stdout.split('\n').map((line) => {
    const host = String(line || '').trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    if (!host) return null;
    return host === root || host.endsWith(`.${root}`) ? host : null;
  }).filter(Boolean), CAPS.endpoints);
}

function normalizeScopedUrl(value, target) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.username = '';
    url.password = '';
    url.hash = '';
    const host = url.hostname.toLowerCase();
    const root = String(target || '').toLowerCase();
    if (host !== root && !host.endsWith(`.${root}`)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function ffufTargetUrl(root) {
  try {
    const url = new URL(String(root || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.username = '';
    url.password = '';
    url.hash = '';
    url.search = '';
    const basePath = url.pathname.replace(/\/?$/, '/');
    url.pathname = `${basePath}FUZZ`;
    return url.toString();
  } catch {
    return null;
  }
}

function parseFfufEndpoints(stdout, target) {
  const endpoints = [];
  const addResult = (result) => {
    const url = normalizeScopedUrl(result?.url || result?.redirectlocation || '', target);
    if (url) endpoints.push(url);
  };

  const parseValue = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.results)) value.results.forEach(addResult);
    else addResult(value);
  };

  const whole = stdout.trim();
  if (whole) {
    try {
      parseValue(JSON.parse(whole));
    } catch {
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('{')) continue;
        try { parseValue(JSON.parse(trimmed)); } catch {}
      }
    }
  }

  return uniqueStrings(endpoints, CAPS.endpoints);
}

function parseScopedEndpoints(stdout, target) {
  return uniqueStrings(
    stdout.split('\n').map((line) => normalizeScopedUrl(line, target)).filter(Boolean),
    CAPS.endpoints,
  );
}

function authFetchHeaders(auth = {}) {
  const headers = { 'User-Agent': 'Mozilla/5.0 Omnisect/1.0' };
  for (const header of auth.headers || []) {
    if (header?.name && header?.value) headers[header.name] = header.value;
  }
  if (auth.cookie) headers.Cookie = auth.cookie;
  return headers;
}

async function fetchWithTimeout(url, options = {}, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

async function validateStartUrl(domain, rawUrl) {
  if (!rawUrl) return { url: null };

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: 'start URL is invalid' };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { error: 'start URL must use http or https' };
  }

  url.username = '';
  url.password = '';
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();

  const targetHost = String(domain || '').toLowerCase();
  if (url.hostname !== targetHost) {
    return { error: 'start URL host must match the target domain' };
  }

  const safety = await isSafeTarget(url.hostname);
  if (!safety.safe) {
    return { error: `start URL rejected - ${safety.reason}` };
  }

  return { url: url.toString() };
}

async function testSQLi(jobId, urls, aggressive, auth = {}) {
  const findings = [];
  const seen = new Set();
  const targets = urls.filter((u) => u.includes('?') && u.includes('=')).slice(0, CAPS.sqliUrls);
  const authArgs = authHeaderArgs(auth);

  for (const url of targets) {
    let parsed;
    try { parsed = new URL(url); } catch { continue; }
    const paramKeys = [...parsed.searchParams.keys()].slice(0, CAPS.paramsPerUrl);

    for (const key of paramKeys) {
      const sig = `${parsed.origin}${parsed.pathname}?${key}`;
      if (seen.has(sig)) continue;
      let signaled = false;

      // ---- 1. Error-based: bare quotes / paren / comment variants
      for (const payload of SQLI_SAFE_PAYLOADS) {
        try {
          const testUrl = mutateParam(parsed, key, payload);
          const { stdout } = await runTool(
            'curl',
            ['-s', '-L', '--max-time', '10', '-H', 'User-Agent: Mozilla/5.0', ...authArgs, testUrl],
            { timeout: 15000, onProcess: (p) => trackProcess(jobId, p) }
          );
          for (const pattern of SQLI_ERROR_PATTERNS) {
            if (pattern.test(stdout)) {
              findings.push({
                type: 'sqli',
                severity: 'high',
                url,
                testUrl,
                payload,
                description: `Potential SQL Injection (error-based) — parameter '${key}' triggered database error`,
                evidence: stdout.substring(0, 300),
              });
              signaled = true;
              break;
            }
          }
          if (signaled) break;
        } catch { /* skip */ }
      }

      // ---- 2. Time-based blind (aggressive only — sends SLEEP/WAITFOR/pg_sleep)
      if (!signaled && aggressive) {
        try {
          // Baseline: how long does a normal request take? Average two samples to
          // dampen jitter.
          const baseUrl = mutateParam(parsed, key, '1');
          const sample = async () => {
            const t = Date.now();
            await runTool('curl', ['-s', '-L', '--max-time', '8', '-o', '/dev/null', ...authArgs, baseUrl], {
              timeout: 12000, onProcess: (p) => trackProcess(jobId, p),
            });
            return Date.now() - t;
          };
          const baselineMs = Math.round((await sample() + await sample()) / 2);

          // Try each timing template; first hit wins.
          for (const tmpl of SQLI_TIMING_TEMPLATES) {
            const payload = tmpl(5);
            const probeUrl = mutateParam(parsed, key, payload);
            const t = Date.now();
            try {
              await runTool('curl', ['-s', '-L', '--max-time', '15', '-o', '/dev/null', ...authArgs, probeUrl], {
                timeout: 20000, onProcess: (p) => trackProcess(jobId, p),
              });
            } catch { continue; }
            const probeMs = Date.now() - t;
            const delta = probeMs - baselineMs;
            // 5s SLEEP + small overhead. Lower bound 4s rules out network jitter;
            // upper bound 9s rules out timeouts and unrelated slowdowns.
            if (delta >= 4000 && delta <= 9000) {
              findings.push({
                type: 'sqli',
                severity: 'high',
                url,
                testUrl: probeUrl,
                payload,
                description: `Potential SQL Injection (time-based blind) — parameter '${key}' delayed response by ${delta}ms vs baseline ${baselineMs}ms`,
                evidence: `baseline=${baselineMs}ms · sleep5=${probeMs}ms · delta=${delta}ms`,
              });
              signaled = true;
              break;
            }
          }
        } catch { /* skip */ }
      }

      seen.add(sig);
    }
  }
  return findings;
}

async function testXSS(jobId, urls, auth = {}) {
  const findings = [];
  const seen = new Set();
  const targets = urls.filter((u) => u.includes('?') && u.includes('=')).slice(0, CAPS.xssUrls);
  const authArgs = authHeaderArgs(auth);

  for (const url of targets) {
    let parsed;
    try { parsed = new URL(url); } catch { continue; }
    const paramKeys = [...parsed.searchParams.keys()].slice(0, CAPS.paramsPerUrl);

    for (const key of paramKeys) {
      const sig = `${parsed.origin}${parsed.pathname}?${key}`;
      if (seen.has(sig)) continue;

      // Try each payload family. First reflection wins for this (host, path, param).
      for (const probe of XSS_PAYLOADS) {
        try {
          const testUrl = mutateParam(parsed, key, probe.p);
          const { stdout } = await runTool(
            'curl',
            ['-s', '-L', '--max-time', '10', '-H', 'User-Agent: Mozilla/5.0', ...authArgs, testUrl],
            { timeout: 15000, onProcess: (p) => trackProcess(jobId, p) }
          );
          if (probe.match.test(stdout)) {
            findings.push({
              type: 'xss',
              severity: 'medium',
              url,
              testUrl,
              payload: probe.p,
              description: `Potential Reflected XSS — parameter '${key}' reflected payload unescaped in response`,
              evidence: extractContext(stdout, probe.p, 80) || extractContext(stdout, XSS_CANARY, 80),
            });
            break;
          }
        } catch { /* skip */ }
      }
      seen.add(sig);
    }
  }
  return findings;
}

// --- IDOR test (rewritten) ---
// Heuristic: only flag when BOTH responses are 200, SAME content-type,
// SIMILAR body size (within 30%), body content DIFFERS, and the response
// contains personalized-data signals (email, "user", "account", etc).
// Cuts the false-positive rate dramatically vs. raw body equality check.
function parseCurlResponse(raw) {
  const sep = raw.indexOf('\r\n\r\n') !== -1
    ? { idx: raw.indexOf('\r\n\r\n'), len: 4 }
    : { idx: raw.indexOf('\n\n'), len: 2 };
  if (sep.idx === -1) return null;
  const headers = raw.substring(0, sep.idx);
  const body = raw.substring(sep.idx + sep.len);
  const statusMatch = headers.match(/HTTP\/[\d.]+\s+(\d+)/);
  const ctMatch = headers.match(/content-type:\s*([^\r\n;]+)/i);
  return {
    status: statusMatch?.[1] || 'unknown',
    contentType: (ctMatch?.[1] || '').trim().toLowerCase(),
    body,
    bodyLength: body.length,
  };
}

const USER_DATA_RE = /(@|\bemail\b|\buser(?:name)?\b|\baccount\b|\bprofile\b|\bsession\b)/i;

// Broadened IDOR detection: numeric query-string IDs, UUID query-string IDs,
// and numeric path-segment IDs (e.g. /users/123/profile, /orders/45).
const IDOR_PARAM_NAMES = '(?:id|user_id|uid|account_id?|item_id?|order_id?|post_id?|profile_id?|message_id?|invoice_id?|customer_id?)';
const IDOR_PATH_RESOURCES = '(?:users?|accounts?|orders?|items?|posts?|profiles?|messages?|invoices?|customers?)';
const UUID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;

const IDOR_PATTERNS = [
  {
    kind: 'qs-numeric',
    re: new RegExp(`([?&]${IDOR_PARAM_NAMES}=)(\\d+)`, 'i'),
    swap: (full, prefix, id) => prefix + (parseInt(id, 10) > 1 ? parseInt(id, 10) - 1 : parseInt(id, 10) + 1),
  },
  {
    kind: 'qs-uuid',
    re: new RegExp(`([?&]${IDOR_PARAM_NAMES}=)(${UUID_RE.source})`, 'i'),
    swap: (full, prefix, id) => prefix + flipFirstHex(id),
  },
  {
    kind: 'path-numeric',
    re: new RegExp(`(/${IDOR_PATH_RESOURCES}/)(\\d+)(/|$|\\?)`, 'i'),
    swap: (full, prefix, id, suffix) => prefix + (parseInt(id, 10) > 1 ? parseInt(id, 10) - 1 : parseInt(id, 10) + 1) + suffix,
  },
];

function flipFirstHex(uuid) {
  const c = uuid[0].toLowerCase();
  const flipped = (parseInt(c, 16) ^ 1).toString(16);
  return flipped + uuid.slice(1);
}

async function testIDOR(jobId, urls, auth = {}) {
  const findings = [];
  const seen = new Set();
  const candidates = [];
  const authArgs = authHeaderArgs(auth);

  // Build the candidate list: each URL contributes at most one pattern match.
  for (const url of urls) {
    if (candidates.length >= CAPS.idorUrls) break;
    for (const pattern of IDOR_PATTERNS) {
      const m = url.match(pattern.re);
      if (!m) continue;
      const sig = `${pattern.kind}:${url}`;
      if (seen.has(sig)) break;
      seen.add(sig);
      candidates.push({ url, match: m, pattern });
      break;
    }
  }

  for (const { url, match, pattern } of candidates) {
    try {
      const swapped = pattern.swap(...match);
      const testUrl = url.replace(match[0], swapped);
      if (testUrl === url) continue;

      const [origRes, testRes] = await Promise.all([
        runTool('curl', ['-s', '-L', '--max-time', '10', '-i', ...authArgs, url], {
          timeout: 15000, onProcess: (p) => trackProcess(jobId, p),
        }),
        runTool('curl', ['-s', '-L', '--max-time', '10', '-i', ...authArgs, testUrl], {
          timeout: 15000, onProcess: (p) => trackProcess(jobId, p),
        }),
      ]);

      const orig = parseCurlResponse(origRes.stdout);
      const test = parseCurlResponse(testRes.stdout);
      if (!orig || !test) continue;

      const bothOk = orig.status === '200' && test.status === '200';
      const sameType = orig.contentType === test.contentType;
      const sizeDelta = Math.abs(orig.bodyLength - test.bodyLength) / Math.max(orig.bodyLength, 1);
      const similarSize = sizeDelta < 0.50;        // loosened from 0.30 — real IDORs vary more
      const different = orig.body !== test.body;
      const hasUserSignals = USER_DATA_RE.test(test.body) || USER_DATA_RE.test(orig.body);
      const meaningfulSize = orig.bodyLength > 200;

      if (bothOk && sameType && similarSize && different && hasUserSignals && meaningfulSize) {
        findings.push({
          type: 'idor',
          severity: 'medium',
          url,
          testUrl,
          description: `Possible IDOR (${pattern.kind}) — id swap returned a similarly-shaped response with user-identifying data`,
          evidence: `orig ${orig.bodyLength}b → test ${test.bodyLength}b · type ${orig.contentType} · Δ ${(sizeDelta * 100).toFixed(1)}%`,
        });
      }
    } catch { /* skip */ }
  }
  return findings;
}

const SECURITY_HEADER_CHECKS = [
  { header: 'content-security-policy', severity: 'low', label: 'Content-Security-Policy' },
  { header: 'strict-transport-security', severity: 'low', label: 'Strict-Transport-Security' },
  { header: 'x-frame-options', severity: 'low', label: 'X-Frame-Options' },
  { header: 'x-content-type-options', severity: 'info', label: 'X-Content-Type-Options' },
  { header: 'referrer-policy', severity: 'info', label: 'Referrer-Policy' },
  { header: 'permissions-policy', severity: 'info', label: 'Permissions-Policy' },
];

async function checkSecurityHeaders(jobId, urls, auth = {}) {
  const findings = [];
  const targets = uniqueStrings(urls, 40);
  for (const url of targets) {
    try {
      const res = await fetchWithTimeout(url, { headers: authFetchHeaders(auth) }, 12000);
      const headers = new Set([...res.headers.keys()].map((key) => key.toLowerCase()));
      const missing = SECURITY_HEADER_CHECKS.filter((check) => !headers.has(check.header));
      if (missing.length >= 3) {
        const severity = missing.some((check) => check.severity === 'low') ? 'low' : 'info';
        findings.push({
          type: 'headers',
          severity,
          url,
          name: 'Missing common security headers',
          description: `${missing.map((check) => check.label).join(', ')} not observed on the response`,
          evidence: `status=${res.status}; missing=${missing.map((check) => check.label).join(', ')}`,
        });
      }

      const server = res.headers.get('server') || '';
      if (/\d+\.\d+/.test(server)) {
        findings.push({
          type: 'headers',
          severity: 'info',
          url,
          name: 'Server version exposed',
          description: 'The Server header appears to expose version detail',
          evidence: `server=${server}`,
        });
      }
    } catch {
      // Header checks are opportunistic; a failed fetch should not fail a scan.
    }
    if (getJob(jobId)?.status !== 'running') break;
  }
  return findings;
}

const TAKEOVER_FINGERPRINTS = [
  { provider: 'GitHub Pages', cname: ['github.io'], body: ['There isn\'t a GitHub Pages site here'] },
  { provider: 'Heroku', cname: ['herokuapp.com', 'herokudns.com'], body: ['No such app'] },
  { provider: 'AWS S3', cname: ['s3.amazonaws.com', 's3-website'], body: ['NoSuchBucket', 'The specified bucket does not exist'] },
  { provider: 'Fastly', cname: ['fastly.net'], body: ['Fastly error: unknown domain'] },
  { provider: 'Azure', cname: ['azurewebsites.net', 'cloudapp.net'], body: ['404 Web Site not found'] },
  { provider: 'Shopify', cname: ['myshopify.com'], body: ['Sorry, this shop is currently unavailable'] },
  { provider: 'Cargo', cname: ['cargocollective.com'], body: ['404 Not Found'] },
];

async function checkSubdomainTakeover(jobId, hosts) {
  const findings = [];
  const targets = uniqueStrings(hosts, 250);

  for (const host of targets) {
    try {
      const cnames = await dns.resolveCname(host).catch(() => []);
      const chain = cnames.map((name) => String(name || '').toLowerCase());
      const fingerprint = TAKEOVER_FINGERPRINTS.find((item) => (
        chain.some((cname) => item.cname.some((needle) => cname.includes(needle)))
      ));
      if (!fingerprint) continue;

      let confirmed = false;
      let evidence = `cname=${chain.join(', ')}`;
      for (const scheme of ['https', 'http']) {
        try {
          const res = await fetchWithTimeout(`${scheme}://${host}`, { headers: { 'User-Agent': 'Mozilla/5.0 Omnisect/1.0' } }, 10000);
          const body = await res.text();
          const hit = fingerprint.body.find((needle) => body.includes(needle));
          if (hit) {
            confirmed = true;
            evidence = `${evidence}; body="${hit}"`;
            break;
          }
        } catch {
          // Try the next scheme or fall back to CNAME-only evidence.
        }
      }

      findings.push({
        type: 'takeover',
        severity: confirmed ? 'high' : 'medium',
        url: `https://${host}`,
        name: `${confirmed ? 'Likely' : 'Possible'} subdomain takeover`,
        description: `${host} points at ${fingerprint.provider}; verify ownership before reporting`,
        evidence,
      });
    } catch {
      // DNS failures are expected on stale subdomains.
    }
    if (getJob(jobId)?.status !== 'running') break;
  }
  return findings;
}

// --- Main pipeline ---
async function runFullPipeline(jobId, target, config = {}, options = {}) {
  const log = logger.child({ jobId, target });
  log.info('pipeline started');

  const aggressive = config?.aggressive === true;
  const startUrl = options.startUrl || null;
  const targetSettings = options.targetSettings || {};
  const auth = targetSettings.auth || {};
  const authArgs = authHeaderArgs(auth);
  const tools = await getToolStatusSnapshot();
  const onProc = (p) => trackProcess(jobId, p);
  const setProgress = (phase, progress, phaseState = 'running') => {
    updateJob(jobId, { phase, progress });
    setPhase(jobId, phase, phaseState);
  };

  // 0. Passive attack-surface mapping. Its output is an inventory and routing
  // signal for later phases; it is not promoted to a vulnerability finding.
  const ruleDatabase = loadRuleDatabase();
  const maxEndpointPlans = Math.max(25, Math.min(Number(config?.smartMaxEndpoints || ruleDatabase.budgets.maxEndpointPlans), 1000));
  let surfaceReports = [];
  let surfaceReport = null;
  let toolPlan = null;
  const refreshIntelligence = (iteration, context = {}) => {
    if (surfaceReports.length) surfaceReport = mergeSurfaceReports(surfaceReports);
    const planningOptions = {
      adaptive: config?.adaptivePlanning !== false,
      tools: config?.tools,
      target,
      allowedHosts: context.subdomains || [target],
      endpoints: context.endpoints || [],
      liveHosts: context.liveHosts || [],
      maxEndpoints: maxEndpointPlans,
      maxEstimatedRequests: Math.max(
        100,
        Math.min(Number(config?.smartMaxRequests || ruleDatabase.budgets.maxEstimatedRequests), 10000),
      ),
      iteration,
      rules: ruleDatabase,
      availableTools: tools,
    };
    toolPlan = buildToolPlan(surfaceReport, planningOptions);
    const attackGraph = buildAttackGraph(surfaceReport || {}, planningOptions);
    const history = [
      ...(getJob(jobId)?.planningHistory || []),
      {
        iteration,
        generatedAt: toolPlan.generatedAt,
        signals: toolPlan.signals,
        graphSummary: attackGraph.summary,
        selectedTools: toolPlan.selectedTools,
        estimatedRequests: toolPlan.budget.estimatedRequests,
      },
    ].slice(-8);
    updateJob(jobId, {
      attackSurface: surfaceReport ? summarizeAttackSurface(surfaceReport, planningOptions) : null,
      attackGraph,
      endpointPlan: toolPlan.endpointPlan,
      planningHistory: history,
      toolPlan,
    });
  };
  refreshIntelligence(0);
  const surfaceSeed = startUrl || 'https://' + target + '/';
  let httpFallbackAttempted = false;
  const surface = phaseReadiness(config, tools, 'surface', 'surface-mapper');
  if (surface.run) {
    setProgress('surface', 2);
    try {
      surfaceReport = await runSurfaceMapper(surfaceSeed, {
        maxPages: config?.surfaceMaxPages || 20,
        delayMs: config?.surfaceDelayMs || 200,
        timeoutSeconds: config?.surfaceTimeoutSeconds || 90,
        auth,
        onProcess: onProc,
      });
      surfaceReports = [surfaceReport];
      if (!startUrl && !(surfaceReport.pages || []).length) {
        httpFallbackAttempted = true;
        const httpFallback = await runSurfaceMapper('http://' + target + '/', {
          maxPages: config?.surfaceMaxPages || 20,
          delayMs: config?.surfaceDelayMs || 200,
          timeoutSeconds: config?.surfaceTimeoutSeconds || 90,
          auth,
          onProcess: onProc,
        });
        surfaceReports.push(httpFallback);
      }
      refreshIntelligence(1);
      setProgress('surface', 4, 'done');
    } catch (err) {
      if (!startUrl && surfaceSeed.startsWith('https://') && !httpFallbackAttempted) {
        try {
          surfaceReports = [await runSurfaceMapper('http://' + target + '/', {
            maxPages: config?.surfaceMaxPages || 20,
            delayMs: config?.surfaceDelayMs || 200,
            timeoutSeconds: config?.surfaceTimeoutSeconds || 90,
            auth,
            onProcess: onProc,
          })];
          refreshIntelligence(1);
          setProgress('surface', 4, 'done');
        } catch (fallbackError) {
          log.error({ err, fallbackError }, 'surface mapping failed');
          addError(jobId, 'surface-mapper: ' + err.message + '; HTTP fallback: ' + fallbackError.message);
          refreshIntelligence(1);
          setPhase(jobId, 'surface', 'error');
        }
      } else {
        log.error({ err }, 'surface mapping failed');
        addError(jobId, 'surface-mapper: ' + err.message);
        refreshIntelligence(1);
        setPhase(jobId, 'surface', 'error');
      }
    }
  } else {
    markSkipped(
      jobId,
      'surface',
      4,
      surface.reason === 'missing' ? missingMessage('surface-mapper', 'surface') : null,
    );
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 1. Subdomains
  let subdomains = [target];
  const subfinder = phaseReadiness(config, tools, 'subdomains', 'subfinder', toolPlan);
  if (subfinder.run) {
    setProgress('subdomains', 5);
    try {
      const { stdout } = await runTool('subfinder', ['-d', target, '-json', '-silent'], {
        timeout: 120000, onProcess: onProc,
      });
      const parsed = stdout.split('\n').filter((l) => l.trim()).map((l) => {
        try { return JSON.parse(l).host; } catch { return l.trim(); }
      }).filter(Boolean);
      if (parsed.length) subdomains = parsed;
      updateJob(jobId, { subdomains });
      setProgress('subdomains', 16, 'done');
    } catch (err) {
      log.error({ err }, 'subfinder failed');
      addError(jobId, `subfinder: ${err.message}`);
      setPhase(jobId, 'subdomains', 'error');
    }
  } else {
    updateJob(jobId, { subdomains });
    markSkipped(
      jobId,
      'subdomains',
      16,
      subfinder.reason === 'missing' ? missingMessage('subfinder', 'subdomains') : null,
    );
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 1b. Sublist3r fallback discovery
  const sublist3r = phaseReadiness(config, tools, 'sublist3r', 'sublist3r', toolPlan);
  if (sublist3r.run) {
    setProgress('sublist3r', 16);
    try {
      const { stdout } = await runTool('sublist3r', ['-d', target], {
        timeout: 180000, onProcess: onProc,
      });
      subdomains = uniqueStrings([...subdomains, ...parseScopedHosts(stdout, target)]);
      updateJob(jobId, { subdomains });
      setProgress('sublist3r', 17, 'done');
    } catch (err) {
      log.error({ err }, 'sublist3r failed');
      addError(jobId, `sublist3r: ${err.message}`);
      setPhase(jobId, 'sublist3r', 'error');
    }
  } else {
    markSkipped(
      jobId,
      'sublist3r',
      17,
      sublist3r.reason === 'missing' ? missingMessage('sublist3r', 'sublist3r') : null,
    );
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 1c. Certificate transparency logs
  const ctlog = phaseReadiness(config, tools, 'ctlog', 'ctlog', toolPlan);
  if (ctlog.run) {
    setProgress('ctlog', 18);
    try {
      const { stdout } = await runTool('ctlog', [target], {
        timeout: 60000, onProcess: onProc,
      });
      subdomains = uniqueStrings([...subdomains, ...parseScopedHosts(stdout, target)]);
      updateJob(jobId, { subdomains });
      setProgress('ctlog', 19, 'done');
    } catch (err) {
      log.error({ err }, 'ctlog failed');
      addError(jobId, `ctlog: ${err.message}`);
      setPhase(jobId, 'ctlog', 'error');
    }
  } else {
    markSkipped(jobId, 'ctlog', 19, ctlog.reason === 'missing' ? missingMessage('ctlog', 'ctlog') : null);
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 2. DNS validation
  const dnsx = phaseReadiness(config, tools, 'dnsx', 'dnsx', toolPlan);
  if (dnsx.run) {
    setProgress('dnsx', 20);
    try {
      const { stdout } = await runTool('dnsx', ['-silent', '-json'], {
        timeout: 90000, stdin: subdomains.join('\n'), onProcess: onProc,
      });
      const parsed = parseDnsxHosts(stdout);
      if (parsed.length) subdomains = parsed;
      updateJob(jobId, { subdomains });
      setProgress('dnsx', 24, 'done');
    } catch (err) {
      log.error({ err }, 'dnsx failed');
      addError(jobId, `dnsx: ${err.message}`);
      setPhase(jobId, 'dnsx', 'error');
    }
  } else {
    updateJob(jobId, { subdomains });
    markSkipped(
      jobId,
      'dnsx',
      24,
      dnsx.reason === 'missing' ? missingMessage('dnsx', 'dnsx') : null,
    );
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 2b. Subdomain takeover heuristics
  const takeover = phaseReadiness(config, tools, 'takeover', 'takeover', toolPlan);
  if (takeover.run) {
    setProgress('takeover', 25);
    try {
      (await checkSubdomainTakeover(jobId, subdomains)).forEach((f) => addFinding(jobId, f.severity, withEvidence(f, auth)));
      setProgress('takeover', 26, 'done');
    } catch (err) {
      log.error({ err }, 'takeover checks failed');
      addError(jobId, `takeover: ${err.message}`);
      setPhase(jobId, 'takeover', 'error');
    }
  } else {
    markSkipped(jobId, 'takeover', 26, takeover.reason === 'missing' ? missingMessage('takeover', 'takeover') : null);
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 3. Port discovery (connect scan, capped + rate-limited)
  let openPorts = [];
  const naabu = phaseReadiness(config, tools, 'ports', 'naabu', toolPlan);
  if (naabu.run) {
    setProgress('ports', 27);
    try {
      const { stdout } = await runTool(
        'naabu',
        ['-silent', '-json', '-scan-type', 'c', '-top-ports', '100', '-rate', '100', '-retries', '1'],
        { timeout: 120000, stdin: subdomains.join('\n'), onProcess: onProc },
      );
      openPorts = parseNaabuPorts(stdout);
      updateJob(jobId, { openPorts });
      setProgress('ports', 31, 'done');
    } catch (err) {
      log.error({ err }, 'naabu failed');
      addError(jobId, `naabu: ${err.message}`);
      setPhase(jobId, 'ports', 'error');
    }
  } else {
    updateJob(jobId, { openPorts });
    markSkipped(
      jobId,
      'ports',
      31,
      naabu.reason === 'missing' ? missingMessage('naabu', 'ports') : null,
    );
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 3b. Nmap secondary port discovery
  const nmap = phaseReadiness(config, tools, 'nmap', 'nmap', toolPlan);
  if (nmap.run && subdomains.length) {
    setProgress('nmap', 31);
    try {
      const nmapTargets = uniqueStrings(subdomains, 100);
      const { stdout } = await runTool(
        'nmap',
        [
          '-sT', '-Pn', '-n',
          '--top-ports', '100',
          '--max-retries', '1',
          '--host-timeout', '60s',
          '-oG', '-',
          ...nmapTargets,
        ],
        { timeout: 180000, onProcess: onProc },
      );
      openPorts = mergeOpenPorts(openPorts, parseNmapPorts(stdout));
      updateJob(jobId, { openPorts });
      setProgress('nmap', 32, 'done');
    } catch (err) {
      log.error({ err }, 'nmap failed');
      const partial = parseNmapPorts(err.stdout || '');
      if (partial.length) {
        openPorts = mergeOpenPorts(openPorts, partial);
        updateJob(jobId, { openPorts });
      }
      addError(jobId, `nmap: ${err.message}`);
      setPhase(jobId, 'nmap', partial.length ? 'done' : 'error');
    }
  } else {
    updateJob(jobId, { openPorts });
    markSkipped(
      jobId,
      'nmap',
      32,
      nmap.reason === 'missing' ? missingMessage('nmap', 'nmap') : null,
    );
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 4. HTTP probe
  let liveHosts = [];
  const httpx = phaseReadiness(config, tools, 'probe', 'httpx', toolPlan);
  if (httpx.run) {
    setProgress('probe', 33);
    try {
      const probeInputs = uniqueStrings([
        ...subdomains,
        ...openPorts.map((item) => `${item.host}:${item.port}`),
      ]);
      const { stdout } = await runTool('httpx', ['-json', '-silent', '-threads', '50'], {
        timeout: 120000, stdin: probeInputs.join('\n'), onProcess: onProc,
      });
      liveHosts = stdout.split('\n').filter((l) => l.trim()).map((l) => {
        try {
          const p = JSON.parse(l);
          return { url: p.url, status: p.status_code, title: p.title || '', tech: p.tech || [] };
        } catch { return null; }
      }).filter(Boolean);
      updateJob(jobId, { liveHosts });
      setProgress('probe', 44, 'done');
    } catch (err) {
      log.error({ err }, 'httpx failed');
      addError(jobId, `httpx: ${err.message}`);
      setPhase(jobId, 'probe', 'error');
    }
  } else {
    updateJob(jobId, { liveHosts });
    markSkipped(
      jobId,
      'probe',
      44,
      httpx.reason === 'missing' ? missingMessage('httpx', 'probe') : null,
    );
  }

  if (getJob(jobId)?.status !== 'running') return;

  // Revisit a small number of newly discovered web origins. Credentials are
  // intentionally not forwarded to sibling subdomains.
  if (surface.run && surfaceReports.length && liveHosts.length) {
    const initialOrigin = (() => {
      try { return new URL(surfaceSeed).origin; } catch { return ''; }
    })();
    const allowed = new Set(subdomains.map((host) => String(host).toLowerCase()));
    const maxSecondary = Math.max(
      0,
      Math.min(Number(config?.surfaceSecondaryHosts ?? ruleDatabase.budgets.maxSecondaryOrigins), 10),
    );
    const secondarySeeds = uniqueStrings(liveHosts.map((host) => host.url).filter((value) => {
      try {
        const url = new URL(value);
        return url.origin !== initialOrigin && allowed.has(url.hostname.toLowerCase());
      } catch {
        return false;
      }
    }), maxSecondary);
    if (secondarySeeds.length) setPhase(jobId, 'surface', 'running');
    for (const seed of secondarySeeds) {
      if (getJob(jobId)?.status !== 'running') return;
      try {
        const report = await runSurfaceMapper(seed, {
          maxPages: ruleDatabase.budgets.secondaryPagesPerOrigin,
          delayMs: config?.surfaceDelayMs || 200,
          timeoutSeconds: 35,
          onProcess: onProc,
        });
        surfaceReports.push(report);
      } catch (err) {
        log.warn({ seed, err }, 'secondary surface mapping failed');
        addError(jobId, 'surface-mapper secondary origin: ' + err.message);
      }
    }
    if (secondarySeeds.length) setPhase(jobId, 'surface', 'done');
  }
  refreshIntelligence(2, { subdomains, liveHosts });

  // 4b. Security headers
  const headers = phaseReadiness(config, tools, 'headers', 'headers', toolPlan);
  if (headers.run && liveHosts.length) {
    setProgress('headers', 45);
    try {
      const headerTargets = liveHosts.map((host) => host.url).filter(Boolean);
      (await checkSecurityHeaders(jobId, headerTargets, auth)).forEach((f) => addFinding(jobId, f.severity, withEvidence(f, auth)));
      setProgress('headers', 46, 'done');
    } catch (err) {
      log.error({ err }, 'security header checks failed');
      addError(jobId, `headers: ${err.message}`);
      setPhase(jobId, 'headers', 'error');
    }
  } else {
    markSkipped(jobId, 'headers', 46, headers.reason === 'missing' ? missingMessage('headers', 'headers') : null);
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 5. TLS / certificate metadata
  let tls = [];
  const tlsx = phaseReadiness(config, tools, 'tls', 'tlsx', toolPlan);
  const tlsInputs = uniqueStrings([
    ...liveHosts.map((host) => {
      try {
        const url = new URL(host.url);
        if (url.protocol !== 'https:') return null;
        return url.port ? `${url.hostname}:${url.port}` : url.hostname;
      } catch {
        return null;
      }
    }),
    ...openPorts
      .filter((item) => [443, 8443, 9443, 10443, 4443].includes(Number(item.port)))
      .map((item) => `${item.host}:${item.port}`),
  ].filter(Boolean));

  if (tlsx.run && tlsInputs.length) {
    setProgress('tls', 46);
    try {
      const { stdout } = await runTool('tlsx', ['-silent', '-json'], {
        timeout: 90000, stdin: tlsInputs.join('\n'), onProcess: onProc,
      });
      tls = parseTlsxMetadata(stdout);
      updateJob(jobId, { tls });
      setProgress('tls', 49, 'done');
    } catch (err) {
      log.error({ err }, 'tlsx failed');
      addError(jobId, `tlsx: ${err.message}`);
      setPhase(jobId, 'tls', 'error');
    }
  } else {
    updateJob(jobId, { tls });
    markSkipped(
      jobId,
      'tls',
      49,
      tlsx.reason === 'missing' ? missingMessage('tlsx', 'tls') : null,
    );
  }

  if (getJob(jobId)?.status !== 'running') return;

  const targetUrls = uniqueStrings([
    startUrl,
    ...(liveHosts.length ? liveHosts.map((h) => h.url) : [`https://${target}`, `http://${target}`]),
  ].filter(Boolean));

  // 6. Passive crawl
  let endpoints = uniqueStrings(surfaceEndpoints(surfaceReport || {}, target), CAPS.endpoints);
  updateJob(jobId, { endpoints });
  const gau = phaseReadiness(config, tools, 'crawl', 'gau', toolPlan);
  if (gau.run) {
    setProgress('crawl', 51);
    try {
      const { stdout } = await runTool(
        'gau',
        [
          '--blacklist', 'png,jpg,gif,css,woff,svg,ico,ttf,eot,mp4,mp3',
          '--threads', String(GAU_THREADS),
          '--timeout', String(GAU_HTTP_TIMEOUT_SECONDS),
          '--retries', '1',
          target,
        ],
        { timeout: GAU_TIMEOUT_MS, onProcess: onProc }
      );
      endpoints = uniqueStrings([...endpoints, ...parseGauEndpoints(stdout)]);
      updateJob(jobId, { endpoints });
      setProgress('crawl', 58, 'done');
    } catch (err) {
      log.error({ err }, 'gau failed');
      const partial = parseGauEndpoints(err.stdout || '');
      if (partial.length) {
        endpoints = uniqueStrings([...endpoints, ...partial]);
        updateJob(jobId, { endpoints });
      }
      addError(jobId, `gau: passive crawl did not finish (${err.message}); continuing with active crawl`);
      setProgress('crawl', 58, partial.length ? 'done' : 'skipped');
    }
  } else {
    updateJob(jobId, { endpoints });
    markSkipped(
      jobId,
      'crawl',
      58,
      gau.reason === 'missing' ? missingMessage('gau', 'crawl') : null,
    );
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 6b. Wayback Machine endpoints
  const wayback = phaseReadiness(config, tools, 'wayback', 'wayback', toolPlan);
  if (wayback.run) {
    setProgress('wayback', 59);
    try {
      const { stdout } = await runTool('wayback', [target], {
        timeout: 70000, onProcess: onProc,
      });
      endpoints = uniqueStrings([...endpoints, ...parseScopedEndpoints(stdout, target)], CAPS.endpoints);
      updateJob(jobId, { endpoints });
      setProgress('wayback', 60, 'done');
    } catch (err) {
      log.error({ err }, 'wayback failed');
      addError(jobId, `wayback: ${err.message}`);
      setPhase(jobId, 'wayback', 'error');
    }
  } else {
    markSkipped(jobId, 'wayback', 60, wayback.reason === 'missing' ? missingMessage('wayback', 'wayback') : null);
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 6c. urlscan.io endpoints
  const urlscan = phaseReadiness(config, tools, 'urlscan', 'urlscan', toolPlan);
  if (urlscan.run) {
    setProgress('urlscan', 61);
    try {
      const { stdout } = await runTool('urlscan', [target], {
        timeout: 45000, onProcess: onProc,
      });
      endpoints = uniqueStrings([...endpoints, ...parseScopedEndpoints(stdout, target)], CAPS.endpoints);
      updateJob(jobId, { endpoints });
      setProgress('urlscan', 62, 'done');
    } catch (err) {
      log.error({ err }, 'urlscan failed');
      addError(jobId, `urlscan: ${err.message}`);
      setPhase(jobId, 'urlscan', 'error');
    }
  } else {
    markSkipped(jobId, 'urlscan', 62, urlscan.reason === 'missing' ? missingMessage('urlscan', 'urlscan') : null);
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 6d. robots.txt and sitemap discovery
  const robots = phaseReadiness(config, tools, 'robots', 'robots', toolPlan);
  if (robots.run) {
    setProgress('robots', 63);
    try {
      const roots = targetUrls.length ? targetUrls : [`https://${target}`, `http://${target}`];
      const { stdout } = await runTool('robots', [], {
        timeout: 60000, stdin: roots.join('\n'), onProcess: onProc,
      });
      endpoints = uniqueStrings([...endpoints, ...parseScopedEndpoints(stdout, target)], CAPS.endpoints);
      updateJob(jobId, { endpoints });
      setProgress('robots', 64, 'done');
    } catch (err) {
      log.error({ err }, 'robots discovery failed');
      addError(jobId, `robots: ${err.message}`);
      setPhase(jobId, 'robots', 'error');
    }
  } else {
    markSkipped(jobId, 'robots', 64, robots.reason === 'missing' ? missingMessage('robots', 'robots') : null);
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 6e. ffuf content discovery
  const ffuf = phaseReadiness(config, tools, 'ffuf', 'ffuf', toolPlan);
  if (ffuf.run && targetUrls.length) {
    setProgress('ffuf', 65);
    try {
      const ffufEndpoints = [];
      const fuzzTargets = uniqueStrings(targetUrls.map(ffufTargetUrl).filter(Boolean), 4);
      for (const fuzzUrl of fuzzTargets) {
        const { stdout } = await runTool(
          'ffuf',
          [
            '-u', fuzzUrl,
            '-w', FFUF_WORDLIST,
            '-mc', '200,204,301,302,307,308,401,403',
            '-t', '20',
            '-rate', '80',
            '-timeout', '8',
            '-ac',
            '-json',
            '-s',
            ...authArgs,
          ],
          { timeout: 90000, onProcess: onProc },
        );
        ffufEndpoints.push(...parseFfufEndpoints(stdout, target));
        if (getJob(jobId)?.status !== 'running') return;
      }
      endpoints = uniqueStrings([...endpoints, ...ffufEndpoints], CAPS.endpoints);
      updateJob(jobId, { endpoints });
      setProgress('ffuf', 66, 'done');
    } catch (err) {
      log.error({ err }, 'ffuf failed');
      const partial = parseFfufEndpoints(err.stdout || '', target);
      if (partial.length) {
        endpoints = uniqueStrings([...endpoints, ...partial], CAPS.endpoints);
        updateJob(jobId, { endpoints });
      }
      addError(jobId, `ffuf: ${err.message}`);
      setPhase(jobId, 'ffuf', partial.length ? 'done' : 'error');
    }
  } else {
    updateJob(jobId, { endpoints });
    markSkipped(jobId, 'ffuf', 66, ffuf.reason === 'missing' ? missingMessage('ffuf', 'ffuf') : null);
  }

  if (getJob(jobId)?.status !== 'running') return;

  // 7. Active crawl
  const katana = phaseReadiness(config, tools, 'katana', 'katana', toolPlan);
  if (katana.run) {
    setProgress('katana', 67);
    try {
      const crawlTargets = targetUrls.slice(0, 5);
      const katanaEndpoints = [];
      let timedOutHosts = 0;

      // Stream endpoints as katana emits them. If a per-host crawl times out,
      // we still keep everything that streamed in before the timeout, and we
      // continue on to the next host instead of aborting the whole phase.
      for (const url of crawlTargets) {
        let captured = 0;
        let buffer = '';
        const collect = (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          // Last segment may be a partial line — keep it for the next chunk.
          buffer = lines.pop() || '';
          for (const ep of parseKatanaEndpoints(lines.join('\n'))) {
            katanaEndpoints.push(ep);
            captured++;
          }
        };

        try {
          await runTool(
            'katana',
            [
              '-u', url,
              '-silent', '-jsonl',
              ...authArgs,
              '-d', '2',          // crawl depth
              '-c', '15',         // concurrency
              '-p', '10',         // parallelism
              '-rl', '120',       // rate limit (req/sec) — be polite, avoid 429
              '-timeout', '8',    // per-request timeout (seconds)
              '-mr', '600',       // hard cap on total requests per host
              '-iqp',             // ignore query params for dedup (less crawl bloat)
            ],
            {
              timeout: 180000,    // raised from 120s → 180s
              onProcess: onProc,
              onData: collect,
            }
          );
        } catch (err) {
          // Timeouts are expected on heavy sites; record them once and move on.
          if (/timed out/i.test(String(err.message))) {
            timedOutHosts++;
            log.warn({ url, captured }, 'katana host timed out — kept partial results');
          } else {
            log.error({ url, err }, 'katana host errored');
          }
        }
        if (getJob(jobId)?.status !== 'running') return;
      }

      if (timedOutHosts) {
        addError(
          jobId,
          `katana: ${timedOutHosts} host(s) hit the 180s cap; kept ${katanaEndpoints.length} partial endpoints`,
        );
      }

      endpoints = uniqueStrings([...endpoints, ...katanaEndpoints], CAPS.endpoints);
      updateJob(jobId, { endpoints });
      setProgress('katana', 68, 'done');
    } catch (err) {
      log.error({ err }, 'katana failed');
      addError(jobId, `katana: ${err.message}`);
      setPhase(jobId, 'katana', 'error');
    }
  } else {
    updateJob(jobId, { endpoints });
    markSkipped(
      jobId,
      'katana',
      68,
      katana.reason === 'missing' ? missingMessage('katana', 'katana') : null,
    );
  }

  if (getJob(jobId)?.status !== 'running') return;

  // Bounded feedback loop: newly discovered endpoints and technology evidence
  // update the graph and the remaining execution plan before active validators.
  refreshIntelligence(3, { subdomains, liveHosts, endpoints });

  // 8. Nuclei + tech
  const nuclei = phaseReadiness(config, tools, 'nuclei', 'nuclei', toolPlan);
  if (nuclei.run) {
    setProgress('nuclei', 70);
    setPhase(jobId, 'technologies', 'running');
    try {
      const plannedNuclei = toolPlan?.endpointPlan?.byTool?.nuclei || [];
      const urlList = (
        config?.adaptivePlanning !== false && toolPlan?.evidenceAvailable
          ? plannedNuclei
          : [...new Set([...targetUrls, ...endpoints])]
      ).slice(0, CAPS.nucleiUrls);
      const { stdout } = await runTool(
        'nuclei',
        ['-json', '-silent', ...authArgs, '-severity', 'critical,high,medium,low,info', '-timeout', '10', '-bulk-size', '25', '-rate-limit', '100'],
        { timeout: 180000, stdin: urlList.join('\n'), onProcess: onProc,
          onData: (chunk) => {
            // Stream findings as Nuclei outputs them (line-buffered JSON)
            chunk.split('\n').filter(Boolean).forEach((line) => {
              try {
                const f = JSON.parse(line);
                const sev = (f.info?.severity || 'info').toLowerCase();
                addFinding(jobId, sev, withEvidence({
                  type: 'nuclei',
                  template: f['template-id'],
                  name: f.info?.name,
                  url: f.matched_at || f.host,
                  severity: sev,
                  description: f.info?.description || '',
                  reference: Array.isArray(f.info?.reference) ? f.info.reference[0] : f.info?.reference,
                  evidence: f.extracted_results ? f.extracted_results.join(', ') : null,
                }, auth));
              } catch {}
            });
          },
        }
      );
      setProgress('nuclei', 81, 'done');
      setPhase(jobId, 'technologies', 'done');
    } catch (err) {
      log.error({ err }, 'nuclei failed');
      addError(jobId, `nuclei: ${err.message}`);
      setPhase(jobId, 'nuclei', 'error');
      setPhase(jobId, 'technologies', 'error');
    }
  } else {
    const message = nuclei.reason === 'missing'
      ? 'nuclei: unavailable - skipped technology fingerprinting and nuclei scanning'
      : null;
    markSkipped(jobId, 'technologies', 72, null);
    markSkipped(jobId, 'nuclei', 81, message);
  }

  if (getJob(jobId)?.status !== 'running') return;

  const allUrls = [...new Set([...targetUrls, ...endpoints])];
  const urlsFor = (tool) => (
    config?.adaptivePlanning !== false && toolPlan?.evidenceAvailable
      ? (toolPlan?.endpointPlan?.byTool?.[tool] || [])
      : allUrls
  );

  // 9. SQLi
  const sqli = phaseReadiness(config, tools, 'sqli', 'curl', toolPlan);
  if (sqli.run) {
    setProgress('sqli', 84);
    (await testSQLi(jobId, urlsFor('sqli'), aggressive, auth)).forEach((f) => addFinding(jobId, f.severity, withEvidence(f, auth)));
    setProgress('sqli', 89, 'done');
  } else {
    markSkipped(
      jobId,
      'sqli',
      89,
      sqli.reason === 'missing' ? missingMessage('curl', 'sqli') : null,
    );
  }
  if (getJob(jobId)?.status !== 'running') return;

  // 10. XSS
  const xss = phaseReadiness(config, tools, 'xss', 'curl', toolPlan);
  if (xss.run) {
    setProgress('xss', 91);
    (await testXSS(jobId, urlsFor('xss'), auth)).forEach((f) => addFinding(jobId, f.severity, withEvidence(f, auth)));
    setProgress('xss', 95, 'done');
  } else {
    markSkipped(
      jobId,
      'xss',
      95,
      xss.reason === 'missing' ? missingMessage('curl', 'xss') : null,
    );
  }
  if (getJob(jobId)?.status !== 'running') return;

  // 11. IDOR
  const idor = phaseReadiness(config, tools, 'idor', 'curl', toolPlan);
  if (idor.run) {
    setProgress('idor', 97);
    (await testIDOR(jobId, urlsFor('idor'), auth)).forEach((f) => addFinding(jobId, f.severity, withEvidence(f, auth)));
    setProgress('idor', 98, 'done');
  } else {
    markSkipped(
      jobId,
      'idor',
      98,
      idor.reason === 'missing' ? missingMessage('curl', 'idor') : null,
    );
  }

  // Diff against previous scan and mark new findings
  const prevJob = storage.findLatestJobForTarget(target);
  const previousFlat = prevJob && prevJob.id !== jobId
    ? Object.values(prevJob.findings || {}).flat()
    : [];
  if (previousFlat.length) {
    const job = getJob(jobId);
    job.findings = applyFingerprintsAndDiff(job.findings, previousFlat);
  }

  const graphSummary = getJob(jobId)?.attackGraph?.summary || {};
  const previousGraph = prevJob?.attackGraph?.summary || {};
  const coverage = {
    current: graphSummary,
    previousJobId: prevJob?.id || null,
    delta: Object.fromEntries(
      Object.keys(graphSummary).map((key) => [key, Number(graphSummary[key] || 0) - Number(previousGraph[key] || 0)]),
    ),
  };
  updateJob(jobId, {
    status: 'completed',
    phase: 'done',
    progress: 100,
    completedAt: new Date().toISOString(),
    coverage,
  });
  try {
    recordPlannerOutcome(getJob(jobId));
    updateJob(jobId, { learningRecordSaved: true });
  } catch (err) {
    log.warn({ err }, 'planner learning record could not be saved');
    addError(jobId, 'planner learning record: ' + err.message);
  }
  await sendWebhook(getJob(jobId));
  sse.publish(jobId, 'complete', publicView(getJob(jobId)));
  sse.closeAll(jobId);
  log.info('pipeline completed');
}

function updateQueuedPositions() {
  pendingQueue.forEach((jobId, index) => {
    const job = getJob(jobId);
    if (job?.status === 'queued') {
      updateJob(jobId, { queuePosition: index + 1, phase: 'queued', progress: 0 });
    }
  });
}

function removeFromQueue(jobId) {
  const index = pendingQueue.indexOf(jobId);
  if (index !== -1) {
    pendingQueue.splice(index, 1);
    updateQueuedPositions();
  }
}

function startJob(job) {
  if (!job || (job.status !== 'queued' && job.status !== 'running')) return;
  removeFromQueue(job.id);
  const startedAt = job.startedAt || new Date().toISOString();
  const live = updateJob(job.id, {
    status: 'running',
    phase: 'initializing',
    progress: 0,
    queuePosition: null,
    startedAt,
  });

  runFullPipeline(live.id, live.target, live.config, {
    startUrl: live.startUrl,
    targetSettings: live.targetSettings || {},
  }).catch((err) => {
    const current = getJob(live.id);
    if (current?.status !== 'cancelled') {
      logger.error({ err, jobId: live.id }, 'pipeline crashed');
      updateJob(live.id, { status: 'failed', phase: 'error', completedAt: new Date().toISOString() });
      addError(live.id, `pipeline: ${err.message}`);
      sse.closeAll(live.id);
    }
  }).finally(() => {
    drainQueue();
  });
}

function drainQueue() {
  while (runningCount() < MAX_CONCURRENT && pendingQueue.length) {
    const jobId = pendingQueue.shift();
    const job = getJob(jobId);
    if (job?.status === 'queued') startJob(job);
  }
  updateQueuedPositions();
}

function enqueueJob(job) {
  if (!pendingQueue.includes(job.id)) pendingQueue.push(job.id);
  updateQueuedPositions();
  drainQueue();
}

setImmediate(() => {
  for (const job of listRawJobs()) {
    if (job.status === 'queued') enqueueJob(job);
  }
});

// --- Routes ---

// POST /api/scan/full
router.post('/full', (req, res) => {
  const { domain, config, startUrl } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain is required' });

  validateStartUrl(domain, startUrl).then((seed) => {
    if (seed.error) {
      return res.status(400).json({ error: seed.error });
    }

    const targetSettings = storage.loadTargetSettings(domain);
    const effectiveConfig = mergeScanConfig(config || {}, targetSettings.config || {});
    const shouldQueue = runningCount() >= MAX_CONCURRENT || pendingQueue.length > 0;
    const job = createJob(domain, effectiveConfig, {
      startUrl: seed.url,
      status: shouldQueue ? 'queued' : 'running',
      queuedAt: shouldQueue ? new Date().toISOString() : null,
      targetSettings,
    });

    if (shouldQueue) {
      enqueueJob(job);
      return res.json(publicView(getJob(job.id)));
    }

    startJob(job);
    return res.json(publicView(getJob(job.id)));
  }).catch((err) => {
    logger.error({ err }, 'start URL validation failed');
    res.status(500).json({ error: err.message || 'start URL validation failed' });
  });
});

// GET /api/scan/status/:jobId — one-shot snapshot (used as SSE fallback)
router.get('/status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json(publicView(job));
});


// POST /api/scan/events/:jobId/ticket — short-lived SSE ticket (API key via header only)
router.post('/events/:jobId/ticket', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  const issued = createSseTicket(req.params.jobId);
  res.json(issued);
});

// GET /api/scan/events/:jobId — Server-Sent Events stream (auth via short-lived ?ticket=)
router.get('/events/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });

  sse.subscribe(req.params.jobId, res);
  // Send initial snapshot immediately so clients don't wait for next change
  res.write(`event: snapshot\ndata: ${JSON.stringify(publicView(job))}\n\n`);

  // If already terminal, close stream after sending snapshot
  if (isTerminal(job)) {
    setTimeout(() => {
      try { res.end(); } catch {}
    }, 100);
  }
});

// Summarize a job for the history list — keeps the response light by stripping
// the full findings arrays and only returning per-severity counts.
function summarizeJob(job) {
  const f = job.findings || {};
  const allFindings = Object.values(f).flat();
  const counts = {
    critical: f.critical?.length || 0,
    high:     f.high?.length || 0,
    medium:   f.medium?.length || 0,
    low:      f.low?.length || 0,
    info:     f.info?.length || 0,
  };
  const findingsTotal = counts.critical + counts.high + counts.medium + counts.low + counts.info;
  const newCount = allFindings.filter((finding) => finding?.isNew).length;
  const durationMs = job.completedAt && job.startedAt
    ? new Date(job.completedAt) - new Date(job.startedAt)
    : null;
  return {
    jobId: job.id,
    target: job.target,
    startUrl: job.startUrl || null,
    status: job.status,
    queuePosition: job.queuePosition || null,
    queuedAt: job.queuedAt || null,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    durationMs,
    counts,
    findingsTotal,
    newCount,
    subdomainCount: (job.subdomains || []).length,
    openPortCount: (job.openPorts || []).length,
    liveHostCount: (job.liveHosts || []).length,
    endpointCount: (job.endpoints || []).length,
    errorCount: (job.errors || []).length,
  };
}

// GET /api/scan/history — list past scans (newest first).
// Optional ?target= filter and ?limit= (default 50, max 500).
router.get('/history', (req, res) => {
  const { target } = req.query;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
  let all = storage.listJobs();
  if (target) all = all.filter((j) => j.target === target);
  all.sort((a, b) => new Date(b.startedAt || b.queuedAt || 0) - new Date(a.startedAt || a.queuedAt || 0));
  res.json({
    target: target || null,
    total: all.length,
    jobs: all.slice(0, limit).map(summarizeJob),
  });
});

// GET /api/scan/snapshot/:jobId — full snapshot of any persisted job.
// Works for both in-memory live jobs and on-disk historical ones.
router.get('/snapshot/:jobId', (req, res) => {
  const job = getJob(req.params.jobId) || storage.loadJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json(publicView(job));
});

router.get('/queue', (req, res) => {
  const jobs = listRawJobs()
    .filter((job) => job.status === 'queued' || job.status === 'running')
    .sort((a, b) => (a.queuePosition || 0) - (b.queuePosition || 0))
    .map(publicView);
  res.json({ maxConcurrent: MAX_CONCURRENT, running: runningCount(), queued: pendingQueue.length, jobs });
});

router.get('/settings/:target', (req, res) => {
  const target = decodeURIComponent(req.params.target || '');
  res.json(storage.loadTargetSettings(target));
});

router.put('/settings/:target', (req, res) => {
  const target = decodeURIComponent(req.params.target || '');
  if (!target) return res.status(400).json({ error: 'target is required' });
  res.json(storage.saveTargetSettings(target, req.body || {}));
});

router.delete('/settings/:target', (req, res) => {
  const target = decodeURIComponent(req.params.target || '');
  storage.deleteTargetSettings(target);
  res.json({ target, deleted: true });
});

router.patch('/finding/:jobId/:findingId', (req, res) => {
  const finding = updateFinding(req.params.jobId, req.params.findingId, req.body || {});
  if (!finding) return res.status(404).json({ error: 'finding not found' });
  try {
    recordTriageFeedback(getJob(req.params.jobId), finding);
  } catch (err) {
    logger.warn({ err, jobId: req.params.jobId }, 'triage feedback could not be recorded');
  }
  res.json({ finding, job: publicView(getJob(req.params.jobId)) });
});

// DELETE /api/scan/snapshot/:jobId — permanently remove a finished scan
// from history (memory + disk). Refuses to delete a running job; cancel it first.
router.delete('/snapshot/:jobId', (req, res) => {
  const job = getJob(req.params.jobId) || storage.loadJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  if (job.status === 'running' || job.status === 'queued') {
    return res.status(400).json({ error: 'cannot delete an active job; cancel it first' });
  }
  deleteJob(req.params.jobId);
  res.json({ jobId: req.params.jobId, deleted: true });
});

// DELETE /api/scan/:jobId — cancel a running scan
router.delete('/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  if (job.status !== 'running' && job.status !== 'queued') return res.status(400).json({ error: `cannot cancel job in status: ${job.status}` });
  removeFromQueue(req.params.jobId);
  killJob(req.params.jobId);
  res.json({ jobId: job.id, status: 'cancelled' });
});

// Single-tool endpoints (now also use trackProcess for cancellation)
router.post('/nuclei', async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls)) return res.status(400).json({ error: 'urls array is required' });
  try {
    const { stdout } = await runTool(
      'nuclei',
      ['-json', '-silent', '-severity', 'critical,high,medium,low,info', '-timeout', '10'],
      { timeout: 180000, stdin: urls.join('\n') }
    );
    const findings = stdout.split('\n').filter((l) => l.trim()).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    res.json({ findings, count: findings.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sqli', async (req, res) => {
  const { urls, aggressive } = req.body;
  if (!Array.isArray(urls)) return res.status(400).json({ error: 'urls array is required' });
  const findings = await testSQLi(null, urls, aggressive === true);
  res.json({ findings, count: findings.length });
});

router.post('/xss', async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls)) return res.status(400).json({ error: 'urls array is required' });
  const findings = await testXSS(null, urls);
  res.json({ findings, count: findings.length });
});

router.post('/idor', async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls)) return res.status(400).json({ error: 'urls array is required' });
  const findings = await testIDOR(null, urls);
  res.json({ findings, count: findings.length });
});

module.exports = router;
