import { useEffect, useMemo, useState } from 'react';
import AnimatedNumber from './AnimatedNumber';
import { api } from '../lib/api';

function values(job, key, pick = (value) => value) {
  return (job?.[key] || []).map(pick).filter(Boolean);
}

function flatFindings(job) {
  return Object.values(job?.findings || {}).flat().filter(Boolean);
}

function setDiff(current, previous) {
  const prev = new Set(previous);
  return current.filter((value) => !prev.has(value));
}

function findingKey(finding) {
  return finding.fingerprint || `${finding.type}:${finding.url}:${finding.name || finding.description || ''}`;
}

function buildDiff(current, previous) {
  const currentHosts = values(current, 'liveHosts', (host) => host.url);
  const previousHosts = values(previous, 'liveHosts', (host) => host.url);
  const currentFindings = flatFindings(current);
  const previousFindingKeys = new Set(flatFindings(previous).map(findingKey));

  return {
    subdomains: setDiff(values(current, 'subdomains'), values(previous, 'subdomains')),
    hosts: setDiff(currentHosts, previousHosts),
    endpoints: setDiff(values(current, 'endpoints'), values(previous, 'endpoints')),
    findings: currentFindings.filter((finding) => !previousFindingKeys.has(findingKey(finding))),
  };
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString();
}

function DiffMetric({ label, value, tone = 'text-ink-500' }) {
  return (
    <div className="summary-metric">
      <p className="eyebrow text-[9px]">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-semibold leading-none tabular-nums ${tone}`}>
        <AnimatedNumber value={value} duration={750} />
      </p>
      <p className="mt-2 font-mono text-[10px] text-ink-100">new</p>
    </div>
  );
}

export default function ScanDiffPanel({ target, job }) {
  const [state, setState] = useState({ loading: false, previous: null, error: '' });
  const jobId = job?.jobId;
  const startedAt = job?.startedAt;

  useEffect(() => {
    if (!target || !jobId || !startedAt) {
      setState({ loading: false, previous: null, diff: null, error: '' });
      return undefined;
    }

    let cancelled = false;
    async function load() {
      setState((current) => ({ ...current, loading: true, error: '' }));
      try {
        const history = await api.getHistory(target, 20);
        const currentTime = new Date(startedAt).getTime();
        const previousSummary = (history.jobs || []).find((item) => (
          item.jobId !== jobId
          && item.status !== 'running'
          && item.status !== 'queued'
          && new Date(item.startedAt).getTime() < currentTime
        ));

        if (!previousSummary) {
          if (!cancelled) setState({ loading: false, previous: null, error: '' });
          return;
        }

        const previous = await api.getSnapshot(previousSummary.jobId);
        if (!cancelled) {
          setState({
            loading: false,
            previous,
            error: '',
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({ loading: false, previous: null, error: err.message || String(err) });
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [jobId, startedAt, target]);

  const diff = useMemo(() => {
    if (!state.previous) return null;
    return buildDiff(job, state.previous);
  }, [job, state.previous]);

  const total = useMemo(() => {
    if (!diff) return 0;
    return diff.subdomains.length + diff.hosts.length + diff.endpoints.length + diff.findings.length;
  }, [diff]);

  if (!jobId) return null;

  return (
    <section className="paper-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow mb-2">diff</p>
          <h3 className="font-sans text-base font-semibold text-ink-500">
            {state.previous ? 'since previous scan' : state.loading ? 'checking previous scan' : 'baseline scan'}
          </h3>
          {state.previous && (
            <p className="mt-1 font-mono text-[10px] text-ink-100">
              previous / {formatTime(state.previous.startedAt)}
            </p>
          )}
          {state.error && <p className="mt-1 font-mono text-[10px] text-signal-bad">{state.error}</p>}
        </div>
        <span className={`status-chip ${total ? 'border-risk-info/40 bg-risk-info/[0.08] text-risk-info' : 'border-signal-good/35 bg-signal-good/[0.06] text-signal-good'}`}>
          {total} changes
        </span>
      </div>

      {diff ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <DiffMetric label="subs" value={diff.subdomains.length} />
          <DiffMetric label="hosts" value={diff.hosts.length} />
          <DiffMetric label="urls" value={diff.endpoints.length} />
          <DiffMetric label="findings" value={diff.findings.length} tone={diff.findings.length ? 'text-risk-high' : 'text-signal-good'} />
        </div>
      ) : (
        <div className="mt-4 rounded-sm border border-ink-500/10 bg-paper-50/55 px-3 py-2.5">
          <p className="font-mono text-[11px] text-ink-200">
            {state.loading ? 'loading comparison...' : 'first comparable run for this target'}
          </p>
        </div>
      )}
    </section>
  );
}
