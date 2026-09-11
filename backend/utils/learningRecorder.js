// Privacy-minimized planner telemetry. These records are suitable for offline
// evaluation and future model training; URLs, headers, cookies and payloads are
// intentionally excluded.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { getDataDir } = require('./paths');
const DEFAULT_PATH = path.join(getDataDir(), 'planner-events.jsonl');

function countFindings(findings = {}) {
  return Object.fromEntries(
    ['critical', 'high', 'medium', 'low', 'info'].map((severity) => [
      severity,
      (findings[severity] || []).length,
    ]),
  );
}

function learningRecord(job = {}) {
  const decisions = Object.fromEntries(
    Object.entries(job.toolPlan?.decisions || {}).map(([tool, item]) => [
      tool,
      {
        selected: item.selected === true,
        confidence: Number(item.confidence || 0),
        coverage: Number(item.coverage || 0),
        reason: String(item.reason || '').slice(0, 240),
      },
    ]),
  );
  return {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    jobId: job.id,
    targetHash: crypto.createHash('sha256').update(String(job.target || '')).digest('hex'),
    plannerVersion: job.toolPlan?.plannerVersion || null,
    ruleDatabaseVersion: job.toolPlan?.ruleDatabase?.version || null,
    iteration: job.toolPlan?.iteration || 0,
    signals: job.toolPlan?.signals || {},
    graphSummary: job.attackGraph?.summary || {},
    budget: job.toolPlan?.budget || {},
    decisions,
    phaseOutcomes: job.phases || {},
    findingCounts: countFindings(job.findings),
    endpointPlanCount: job.toolPlan?.endpointPlan?.plans?.length || 0,
  };
}

function recordPlannerOutcome(job, outputPath = DEFAULT_PATH) {
  const record = learningRecord(job);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.appendFileSync(outputPath, JSON.stringify(record) + '\n', { encoding: 'utf8' });
  return record;
}

function recordTriageFeedback(job = {}, finding = {}, outputPath = DEFAULT_PATH) {
  const record = {
    schemaVersion: 1,
    event: 'triage-feedback',
    recordedAt: new Date().toISOString(),
    jobId: job.id,
    targetHash: crypto.createHash('sha256').update(String(job.target || '')).digest('hex'),
    findingHash: crypto.createHash('sha256').update(String(finding.fingerprint || finding.id || '')).digest('hex'),
    findingType: finding.type || 'unknown',
    originalSeverity: finding.severity || 'unknown',
    triageStatus: finding.triage?.status || 'new',
    severityOverride: finding.triage?.severityOverride || null,
    plannerVersion: job.toolPlan?.plannerVersion || null,
    signals: job.toolPlan?.signals || {},
    decision: job.toolPlan?.decisions?.[finding.type] || null,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.appendFileSync(outputPath, JSON.stringify(record) + '\n', { encoding: 'utf8' });
  return record;
}

module.exports = {
  DEFAULT_PATH,
  learningRecord,
  recordPlannerOutcome,
  recordTriageFeedback,
};
