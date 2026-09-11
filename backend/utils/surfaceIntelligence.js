const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { getDataDir } = require('./paths');
const RULE_DB_PATH = path.join(getDataDir(), 'smart-rules.json');
const ID_NAMES = /^(?:id|uid|uuid|user|user_id|account|account_id|order|order_id|document|document_id|file|file_id|profile|profile_id|customer|customer_id)$/i;
const ID_PATH = /\/(?:users?|accounts?|orders?|items?|posts?|profiles?|messages?|invoices?|customers?)\/(?:\d+|[a-f0-9]{8}-[a-f0-9-]{27,})\b/i;
const TEXT_TYPES = new Set(['text', 'search', 'email', 'url', 'textarea']);
let ruleCache = null;

function safeUrl(value) {
  try { return new URL(value); } catch { return null; }
}

function sanitizeEndpointUrl(value) {
  const parsed = safeUrl(value);
  if (!parsed) return null;
  const safeIdentifier = /^(?:\d{1,18}|[a-f0-9]{8}-[a-f0-9-]{27,})$/i;
  for (const [key, current] of [...parsed.searchParams.entries()]) {
    parsed.searchParams.set(key, safeIdentifier.test(current) ? current : '');
  }
  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  return parsed;
}

function stableId(type, value) {
  return type + ':' + crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function uniqueObjects(items, keyFn, limit = 5000) {
  const found = new Map();
  for (const item of items || []) {
    if (!item) continue;
    const key = keyFn(item);
    if (!key || found.has(key)) continue;
    found.set(key, item);
    if (found.size >= limit) break;
  }
  return [...found.values()];
}

function loadRuleDatabase(file = RULE_DB_PATH) {
  if (file === RULE_DB_PATH && ruleCache) return ruleCache;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.endpointRules) || !parsed.technologyProfiles) {
    throw new Error('smart-rules.json has an unsupported schema');
  }
  if (file === RULE_DB_PATH) ruleCache = parsed;
  return parsed;
}

function mergeSurfaceReports(reports = []) {
  const valid = reports.filter((report) => report && typeof report === 'object');
  const merged = {
    schema_version: '1.2',
    target: valid[0]?.target || null,
    targets: valid.map((report) => report.target).filter(Boolean),
    completed_at: valid.at(-1)?.completed_at || null,
    pages: uniqueObjects(valid.flatMap((report) => report.pages || []), (item) => item.url),
    forms: uniqueObjects(valid.flatMap((report) => report.forms || []), (item) => [item.page_url, item.method, item.action, JSON.stringify(item.fields || [])].join('|')),
    requests: uniqueObjects(valid.flatMap((report) => report.requests || []), (item) => [item.method, item.url, item.resource_type].join('|')),
    scripts: [...new Set(valid.flatMap((report) => report.scripts || []))].slice(0, 5000),
    script_endpoints: [...new Set(valid.flatMap((report) => report.script_endpoints || []))].slice(0, 2000),
    websockets: [...new Set(valid.flatMap((report) => report.websockets || []))].slice(0, 1000),
    cookies: uniqueObjects(valid.flatMap((report) => report.cookies || []), (item) => [item.domain, item.path, item.name].join('|')),
    errors: valid.flatMap((report) => report.errors || []).slice(0, 500),
    findings: uniqueObjects(valid.flatMap((report) => report.findings || []), (item) => [item.id, item.location, item.evidence].join('|')),
  };
  merged.summary = {
    origins_mapped: new Set(merged.pages.map((item) => safeUrl(item.url)?.origin).filter(Boolean)).size,
    pages_visited: merged.pages.length,
    forms_observed: merged.forms.length,
    requests_observed: merged.requests.length,
    scripts_observed: merged.scripts.length,
    script_endpoints_observed: merged.script_endpoints.length,
    websockets_observed: merged.websockets.length,
    errors: merged.errors.length,
    findings: merged.findings.length,
  };
  return merged;
}

function technologiesFrom(report = {}, liveHosts = []) {
  const values = [
    ...(report.pages || []).flatMap((page) => page.technologies || []),
    ...liveHosts.flatMap((host) => host?.tech || []),
    ...(report.scripts || []),
    ...(report.script_endpoints || []),
    ...(report.requests || []).map((request) => request?.url),
  ];
  const result = new Set();
  for (const value of values) {
    const text = String(value || '').toLowerCase();
    if (/wordpress|wp-content|wp-includes/.test(text)) result.add('wordpress');
    if (/next(?:\.js)?|_next\//.test(text)) result.add('nextjs');
    if (/graphql/.test(text)) result.add('graphql');
    if (/openapi|swagger/.test(text)) result.add('openapi');
    if (/spring|jsessionid/.test(text)) result.add('spring');
    if (/react/.test(text)) result.add('react');
    if (/angular|ng-version/.test(text)) result.add('angular');
    if (/vue/.test(text)) result.add('vue');
  }
  return [...result].sort();
}

function formUrl(form) {
  const parsed = safeUrl(form?.action || form?.page_url);
  if (!parsed) return null;
  if (String(form?.method || 'GET').toUpperCase() === 'GET') {
    for (const field of form.fields || []) {
      if (field?.name && !parsed.searchParams.has(field.name)) parsed.searchParams.set(field.name, '');
    }
  }
  return parsed.toString();
}

function endpointRecords(report = {}, extraEndpoints = []) {
  const records = [];
  for (const page of report.pages || []) {
    records.push({ url: page.url, method: 'GET', source: 'page', technologies: page.technologies || [] });
  }
  for (const form of report.forms || []) {
    records.push({
      url: formUrl(form),
      method: String(form.method || 'GET').toUpperCase(),
      source: 'form',
      fields: form.fields || [],
      pageUrl: form.page_url,
    });
  }
  for (const request of report.requests || []) {
    records.push({
      url: request.url,
      method: String(request.method || 'GET').toUpperCase(),
      source: 'browser-request',
      resourceType: request.resource_type,
      bodyParameterNames: request.body_parameter_names || [],
      contentType: request.content_type || '',
    });
  }
  for (const url of extraEndpoints || []) records.push({ url, method: 'GET', source: 'discovery' });
  for (const url of report.script_endpoints || []) records.push({ url, method: 'GET', source: 'javascript' });
  return uniqueObjects(records, (item) => item.method + '|' + (safeUrl(item.url)?.toString() || ''), 5000);
}

function endpointFeatures(record, technologies = []) {
  const parsed = safeUrl(record.url);
  if (!parsed) return null;
  const queryKeys = [...parsed.searchParams.keys()].map((key) => key.toLowerCase());
  const bodyKeys = (record.bodyParameterNames || []).map((key) => String(key).split('.').at(-1).replace(/\[\]$/, '').toLowerCase());
  const fields = record.fields || [];
  const names = [...queryKeys, ...bodyKeys, ...fields.map((field) => String(field?.name || '').toLowerCase())];
  const formKeys = fields.map((field) => String(field?.name || '').toLowerCase()).filter(Boolean);
  const hasBodyParameters = bodyKeys.length > 0 || (record.method !== 'GET' && formKeys.length > 0);
  const api = ['fetch', 'xhr'].includes(record.resourceType) || /\/(?:api|rest|graphql|openapi|swagger)(?:\/|$)/i.test(parsed.pathname);
  return {
    hasQuery: queryKeys.length > 0,
    hasBodyParameters,
    hasInputParameters: queryKeys.length > 0 || bodyKeys.length > 0 || formKeys.length > 0,
    textInput: fields.some((field) => TEXT_TYPES.has(String(field?.type || '').toLowerCase())),
    idParameter: names.some((key) => ID_NAMES.test(key)),
    idPath: ID_PATH.test(parsed.pathname),
    api,
    graphql: /graphql/i.test(parsed.pathname) || technologies.includes('graphql'),
    admin: /\/(?:admin|manage|console|dashboard)(?:\/|$)/i.test(parsed.pathname),
    authentication: /\/(?:login|signin|signup|register|oauth|auth)(?:\/|$)/i.test(parsed.pathname),
    upload: fields.some((field) => field?.type === 'file') || /\/(?:upload|import|attachment)(?:\/|$)/i.test(parsed.pathname),
    queryKeys,
    bodyKeys,
  };
}

function deriveEndpointPlans(report = {}, options = {}) {
  const rules = options.rules || loadRuleDatabase();
  const technologies = technologiesFrom(report, options.liveHosts || []);
  const maxEndpoints = Math.max(1, Math.min(Number(options.maxEndpoints || rules.budgets.maxEndpointPlans), 1000));
  const allowedHosts = new Set((options.allowedHosts || []).map((host) => String(host).toLowerCase()));
  const apex = String(options.target || safeUrl(report.target)?.hostname || '').toLowerCase();
  const candidates = [];
  const plans = [];
  const byTool = { nuclei: [], sqli: [], xss: [], idor: [] };
  let estimatedRequests = 0;
  const requestBudget = Math.max(
    1,
    Math.min(Number(options.maxEstimatedRequests || rules.budgets.maxEstimatedRequests), 10000),
  );

  for (const record of endpointRecords(report, options.endpoints || [])) {
    const parsed = sanitizeEndpointUrl(record.url);
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) continue;
    const host = parsed.hostname.toLowerCase();
    const inScope = allowedHosts.size ? allowedHosts.has(host) : host === apex || host.endsWith('.' + apex);
    if (!inScope) continue;
    const cleanUrl = parsed.toString();
    const features = endpointFeatures({ ...record, url: cleanUrl }, technologies);
    if (!features) continue;
    const checks = [];
    for (const rule of rules.endpointRules) {
      const matched = Object.entries(rule.when || {}).every(([key, expected]) => features[key] === expected);
      if (matched && options.tools?.[rule.tool] !== false) checks.push({
        tool: rule.tool,
        ruleId: rule.id,
        confidence: rule.confidence,
        estimatedRequests: rule.estimatedRequests,
        reason: rule.reason,
      });
    }
    if (options.tools?.nuclei !== false) {
      checks.push({ tool: 'nuclei', ruleId: 'reachable-http', confidence: 0.62, estimatedRequests: 1, reason: 'reachable HTTP surface' });
    }
    const rankedChecks = uniqueObjects(checks.sort((a, b) => b.confidence - a.confidence), (item) => item.tool, 8);
    const featureBoost = [
      features.api,
      features.idParameter || features.idPath,
      features.admin,
      features.authentication,
      features.upload,
    ].filter(Boolean).length * 0.03;
    candidates.push({
      id: stableId('endpoint-plan', record.method + '|' + cleanUrl),
      url: cleanUrl,
      method: record.method,
      source: record.source,
      features,
      checks: rankedChecks,
      priority: Number((Math.min(0.99, Math.max(...rankedChecks.map((item) => item.confidence), 0.5) + featureBoost)).toFixed(2)),
    });
  }

  candidates.sort((a, b) => b.priority - a.priority || a.url.localeCompare(b.url));
  const selectedCandidates = candidates.slice(0, maxEndpoints);
  const checkQueue = selectedCandidates.flatMap((candidate, endpointIndex) =>
    candidate.checks.map((check) => ({ candidate, endpointIndex, check })),
  ).sort((a, b) =>
    b.check.confidence - a.check.confidence
    || b.candidate.priority - a.candidate.priority
    || a.endpointIndex - b.endpointIndex,
  );
  const selectedByEndpoint = new Map(selectedCandidates.map((candidate) => [candidate.id, []]));
  let scheduledChecks = 0;
  for (const item of checkQueue) {
    if (estimatedRequests + item.check.estimatedRequests > requestBudget) continue;
    estimatedRequests += item.check.estimatedRequests;
    selectedByEndpoint.get(item.candidate.id).push(item.check);
    scheduledChecks += 1;
    if (byTool[item.check.tool] && !byTool[item.check.tool].includes(item.candidate.url)) {
      byTool[item.check.tool].push(item.candidate.url);
    }
  }
  for (const candidate of selectedCandidates) {
    plans.push({ ...candidate, checks: selectedByEndpoint.get(candidate.id) });
  }
  return {
    plans,
    byTool,
    technologies,
    estimatedRequests,
    capped: candidates.length > plans.length || scheduledChecks < checkQueue.length,
  };
}

function buildAttackGraph(report = {}, options = {}) {
  const records = endpointRecords(report, options.endpoints || []);
  const technologies = technologiesFrom(report, options.liveHosts || []);
  const nodes = [];
  const edges = [];
  const known = new Set();
  const addNode = (type, value, attributes = {}) => {
    const id = stableId(type, value);
    if (!known.has(id)) {
      known.add(id);
      nodes.push({ id, type, value, attributes });
    }
    return id;
  };
  const addEdge = (from, to, relation) => {
    if (from && to) edges.push({ from, to, relation });
  };

  const graphEndpointLimit = Math.max(25, Math.min(Number(options.maxEndpoints || 500), 1000));
  for (const record of records.slice(0, graphEndpointLimit)) {
    const parsed = sanitizeEndpointUrl(record.url);
    if (!parsed) continue;
    const originId = addNode('origin', parsed.origin);
    const endpointId = addNode('endpoint', parsed.toString(), { method: record.method, source: record.source });
    addEdge(originId, endpointId, 'exposes');
    for (const key of [
      ...parsed.searchParams.keys(),
      ...(record.bodyParameterNames || []),
      ...(record.fields || []).map((field) => field?.name).filter(Boolean),
    ].slice(0, 40)) {
      const parameterId = addNode('parameter', endpointId + ':' + key, { name: key });
      addEdge(endpointId, parameterId, 'accepts');
    }
  }
  for (const script of (report.scripts || []).slice(0, 1000)) {
    const parsed = safeUrl(script);
    const scriptId = addNode('script', script);
    if (parsed) addEdge(addNode('origin', parsed.origin), scriptId, 'loads');
  }
  for (const technology of technologies) addNode('technology', technology);
  for (const form of (report.forms || []).slice(0, 1000)) {
    const formId = addNode('form', [form.page_url, form.method, form.action].join('|'), {
      method: form.method,
      fieldCount: (form.fields || []).length,
    });
    const page = safeUrl(form.page_url);
    if (page) addEdge(addNode('endpoint', page.toString(), { method: 'GET', source: 'page' }), formId, 'contains');
  }
  const types = ['origin', 'endpoint', 'parameter', 'form', 'script', 'technology'];
  return {
    schemaVersion: 1,
    nodes: nodes.slice(0, 3000),
    edges: uniqueObjects(edges, (edge) => [edge.from, edge.to, edge.relation].join('|'), 5000),
    summary: Object.fromEntries(types.map((type) => [type, nodes.filter((node) => node.type === type).length])),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  RULE_DB_PATH,
  buildAttackGraph,
  deriveEndpointPlans,
  endpointFeatures,
  endpointRecords,
  formUrl,
  loadRuleDatabase,
  mergeSurfaceReports,
  sanitizeEndpointUrl,
  technologiesFrom,
};
