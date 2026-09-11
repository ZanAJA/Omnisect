// In-memory job state, written to disk on every meaningful change so a server
// restart loses nothing. Also tracks child processes per job so they can be killed.

const { v4: uuidv4 } = require('uuid');
const storage = require('./storage');
const sse = require('./sseManager');
const { fingerprint } = require('./findingId');
const logger = require('./logger');

const INITIAL_PHASES = {
  surface: 'pending',
  subdomains: 'pending',
  sublist3r: 'pending',
  ctlog: 'pending',
  dnsx: 'pending',
  ports: 'pending',
  nmap: 'pending',
  probe: 'pending',
  headers: 'pending',
  takeover: 'pending',
  tls: 'pending',
  crawl: 'pending',
  wayback: 'pending',
  urlscan: 'pending',
  robots: 'pending',
  ffuf: 'pending',
  katana: 'pending',
  technologies: 'pending',
  nuclei: 'pending',
  sqli: 'pending',
  xss: 'pending',
  idor: 'pending',
};

const jobs = new Map();              // jobId -> job (cached copy of disk)
const jobProcesses = new Map();      // jobId -> Set<ChildProcess>
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const TRIAGE_STATUSES = new Set(['new', 'reviewing', 'confirmed', 'false_positive', 'reported', 'resolved']);

function defaultTriage(finding = {}) {
  const current = finding.triage || {};
  return {
    status: TRIAGE_STATUSES.has(current.status) ? current.status : 'new',
    notes: String(current.notes || '').slice(0, 2000),
    severityOverride: SEVERITIES.includes(current.severityOverride) ? current.severityOverride : null,
    updatedAt: current.updatedAt || null,
  };
}

function normalizeFinding(finding = {}, severity = 'info') {
  const sev = SEVERITIES.includes(finding.severity) ? finding.severity : severity;
  return {
    ...finding,
    severity: sev,
    triage: defaultTriage(finding),
  };
}

function normalizeFindings(findings = {}) {
  return Object.fromEntries(SEVERITIES.map((severity) => [
    severity,
    (findings[severity] || []).map((finding) => normalizeFinding(finding, severity)),
  ]));
}

// Load any persisted jobs on import (resume visibility after restart).
try {
  for (const j of storage.listJobs()) {
    // Mark anything that was running as failed (we lost the process on restart)
    if (j.status === 'running') {
      j.status = 'failed';
      j.errors = [...(j.errors || []), 'orphaned by server restart'];
      j.completedAt = j.completedAt || new Date().toISOString();
      storage.saveJob(j);
    }
    jobs.set(j.id, j);
  }
  logger.info({ count: jobs.size }, 'loaded persisted jobs');
} catch (err) {
  logger.error({ err }, 'failed to load persisted jobs');
}

function createJob(target, config = {}, options = {}) {
  const id = uuidv4();
  const status = options.status || 'running';
  const now = new Date().toISOString();
  const job = {
    id,
    target,
    startUrl: options.startUrl || null,
    targetSettings: options.targetSettings || null,
    config,
    status,
    phase: status === 'queued' ? 'queued' : 'initializing',
    progress: 0,
    queuePosition: options.queuePosition || null,
    phases: { ...INITIAL_PHASES },
    queuedAt: options.queuedAt || (status === 'queued' ? now : null),
    startedAt: status === 'queued' ? null : now,
    completedAt: null,
    findings: { critical: [], high: [], medium: [], low: [], info: [] },
    subdomains: [],
    openPorts: [],
    liveHosts: [],
    tls: [],
    endpoints: [],
    attackSurface: null,
    attackGraph: null,
    endpointPlan: null,
    planningHistory: [],
    toolPlan: null,
    coverage: null,
    learningRecordSaved: false,
    errors: [],
  };
  jobs.set(id, job);
  storage.saveJob(job);
  return job;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function updateJob(id, updates) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, updates);
  storage.saveJob(job);
  sse.publish(id, 'update', publicView(job));
  return job;
}

function setPhase(id, phaseName, state) {
  const job = jobs.get(id);
  if (!job) return;
  job.phases = { ...job.phases, [phaseName]: state };
  storage.saveJob(job);
  sse.publish(id, 'phase', { phase: phaseName, state });
}

function addFinding(id, severity, finding) {
  const job = jobs.get(id);
  if (!job) return;
  const sev = (severity || 'info').toLowerCase();
  if (!job.findings[sev]) return;
  const enriched = {
    ...finding,
    id: uuidv4(),
    severity: sev,
    fingerprint: finding.fingerprint || fingerprint(finding),
    detectedAt: new Date().toISOString(),
    triage: defaultTriage(finding),
  };
  job.findings[sev].push(enriched);
  storage.saveJob(job);
  sse.publish(id, 'finding', enriched);
}

function updateFinding(id, findingId, patch = {}) {
  const job = jobs.get(id);
  if (!job) return null;
  const wanted = String(findingId || '');
  for (const severity of SEVERITIES) {
    const list = job.findings?.[severity] || [];
    const index = list.findIndex((finding) => finding.id === wanted || finding.fingerprint === wanted);
    if (index === -1) continue;

    const current = normalizeFinding(list[index], severity);
    const next = { ...current };
    const triagePatch = patch.triage && typeof patch.triage === 'object' ? patch.triage : patch;
    const triage = { ...current.triage };

    if (TRIAGE_STATUSES.has(triagePatch.status)) triage.status = triagePatch.status;
    if (Object.prototype.hasOwnProperty.call(triagePatch, 'notes')) {
      triage.notes = String(triagePatch.notes || '').slice(0, 2000);
    }
    if (Object.prototype.hasOwnProperty.call(triagePatch, 'severityOverride')) {
      triage.severityOverride = SEVERITIES.includes(triagePatch.severityOverride)
        ? triagePatch.severityOverride
        : null;
    }
    triage.updatedAt = new Date().toISOString();
    next.triage = triage;

    list[index] = next;
    storage.saveJob(job);
    sse.publish(id, 'update', publicView(job));
    return normalizeFinding(next, severity);
  }
  return null;
}

function addError(id, message) {
  const job = jobs.get(id);
  if (!job) return;
  job.errors.push(message);
  storage.saveJob(job);
  // NOTE: event name is 'warning' on purpose — EventSource reserves 'error'
  // for connection failures, and using it for app-level warnings makes the
  // client fire its onerror reconnect path on every published warning.
  sse.publish(id, 'warning', { message });
}

function trackProcess(jobId, proc) {
  if (!jobProcesses.has(jobId)) jobProcesses.set(jobId, new Set());
  jobProcesses.get(jobId).add(proc);
  proc.on('close', () => jobProcesses.get(jobId)?.delete(proc));
}

function killJob(id) {
  const procs = jobProcesses.get(id);
  if (procs) {
    for (const p of procs) {
      try { p.kill('SIGTERM'); } catch {}
    }
    jobProcesses.delete(id);
  }
  const job = jobs.get(id);
  if (job && (job.status === 'running' || job.status === 'queued')) {
    job.status = 'cancelled';
    job.completedAt = new Date().toISOString();
    job.queuePosition = null;
    job.errors.push('cancelled by user');
    storage.saveJob(job);
    sse.publish(id, 'update', publicView(job));
    sse.closeAll(id);
  }
}

function deleteJob(id) {
  killJob(id);
  jobs.delete(id);
  storage.deleteJob(id);
}

function runningCount() {
  let n = 0;
  for (const j of jobs.values()) if (j.status === 'running') n++;
  return n;
}

function listRawJobs() {
  return Array.from(jobs.values());
}

function publicView(job) {
  // What the API surfaces — everything except the internal process map.
  return {
    jobId: job.id,
    target: job.target,
    startUrl: job.startUrl || null,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    queuePosition: job.queuePosition || null,
    queuedAt: job.queuedAt || null,
    phases: job.phases,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    findings: normalizeFindings(job.findings),
    subdomains: job.subdomains || [],
    openPorts: job.openPorts || [],
    liveHosts: job.liveHosts || [],
    tls: job.tls || [],
    endpoints: job.endpoints || [],
    attackSurface: job.attackSurface || null,
    attackGraph: job.attackGraph || null,
    endpointPlan: job.endpointPlan || null,
    planningHistory: job.planningHistory || [],
    toolPlan: job.toolPlan || null,
    coverage: job.coverage || null,
    learningRecordSaved: job.learningRecordSaved === true,
    errors: job.errors || [],
  };
}

function listJobs() {
  return Array.from(jobs.values()).map(publicView);
}

module.exports = {
  createJob, getJob, updateJob, setPhase,
  addFinding, updateFinding, addError, trackProcess, killJob, deleteJob,
  runningCount, listJobs, listRawJobs, publicView, TERMINAL_STATUSES,
};
