import AnimatedNumber from './AnimatedNumber';

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

const SEVERITY_TONE = {
  critical: 'text-risk-critical border-risk-critical/35 bg-risk-critical/[0.08]',
  high: 'text-risk-high border-risk-high/35 bg-risk-high/[0.08]',
  medium: 'text-risk-medium border-risk-medium/30 bg-risk-medium/[0.07]',
  low: 'text-risk-low border-risk-low/25 bg-risk-low/[0.06]',
  info: 'text-risk-info border-risk-info/25 bg-risk-info/[0.06]',
};

function flatFindings(findings = {}) {
  return Object.values(findings || {}).flat().filter(Boolean);
}

function countFindings(findings = {}) {
  return flatFindings(findings).length;
}

function countNewFindings(findings = {}) {
  return flatFindings(findings).filter((finding) => finding.isNew).length;
}

function severityCounts(findings = {}) {
  return Object.fromEntries(SEVERITIES.map((severity) => [severity, findings?.[severity]?.length || 0]));
}

function collectTechStack(job) {
  const counts = new Map();
  (job?.liveHosts || []).forEach((host) => {
    (host.tech || []).forEach((tech) => {
      const label = String(tech || '').trim();
      if (!label) return;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));
}

function statusTone(status) {
  if (status === 'completed') return 'border-signal-good/45 bg-signal-good/[0.08] text-signal-good';
  if (status === 'running') return 'border-ink-500/35 bg-ink-500/[0.08] text-ink-500';
  if (status === 'queued') return 'border-risk-info/35 bg-risk-info/[0.08] text-risk-info';
  if (status === 'failed') return 'border-signal-bad/45 bg-signal-bad/[0.10] text-signal-bad';
  if (status === 'cancelled') return 'border-risk-medium/40 bg-risk-medium/[0.08] text-risk-medium';
  return 'border-ink-500/15 bg-paper-50 text-ink-200';
}

function statusDot(status) {
  if (status === 'running') return 'bg-ink-500 animate-breathe';
  if (status === 'queued') return 'bg-risk-info animate-breathe';
  if (status === 'completed') return 'bg-signal-good';
  if (status === 'failed' || status === 'cancelled') return 'bg-signal-bad';
  return 'bg-mist-300';
}

function SummaryMetric({ label, value, tone = 'text-ink-500', detail }) {
  return (
    <div className="summary-metric">
      <p className="eyebrow text-[9px]">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-semibold leading-none tabular-nums ${tone}`}>
        <AnimatedNumber value={value} duration={800} />
      </p>
      {detail && <p className="mt-2 font-mono text-[10px] text-ink-100 truncate">{detail}</p>}
    </div>
  );
}

export default function ScanSummaryPanel({ job, config }) {
  const counts = severityCounts(job?.findings || {});
  const findingsTotal = countFindings(job?.findings || {});
  const newFindings = countNewFindings(job?.findings || {});
  const warnings = job?.errors?.length || 0;
  const enabledTools = Object.values(config?.tools || {}).filter(Boolean).length;
  const techStack = collectTechStack(job);
  const hotCount = (counts.critical || 0) + (counts.high || 0);

  return (
    <section className="paper-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="eyebrow">current scan</p>
            <span className={`status-chip ${statusTone(job?.status)}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot(job?.status)}`} />
              {job?.status || 'ready'}
            </span>
            <span className="status-chip border-ink-500/15 bg-paper-50 text-ink-200">
              {enabledTools} tools
            </span>
          </div>
          <h3 className="font-sans text-lg sm:text-xl font-semibold text-ink-500">
            {job?.phase ? `phase / ${job.phase}` : 'ready to scan'}
          </h3>
        </div>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2 min-w-0 lg:min-w-[360px]">
          {SEVERITIES.map((severity) => (
            <div
              key={severity}
              className={`rounded-sm border px-2 py-2 text-center ${SEVERITY_TONE[severity]}`}
              title={`${severity}: ${counts[severity] || 0}`}
            >
              <p className="font-mono text-lg font-semibold leading-none tabular-nums">
                <AnimatedNumber value={counts[severity] || 0} duration={700} />
              </p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-wide opacity-80">{severity.slice(0, 4)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <SummaryMetric label="ports" value={job?.openPorts?.length || 0} detail="open" />
        <SummaryMetric label="hosts" value={job?.liveHosts?.length || 0} detail="alive" />
        <SummaryMetric label="urls" value={job?.endpoints?.length || 0} detail="crawled" />
        <SummaryMetric
          label="findings"
          value={findingsTotal}
          tone={hotCount ? 'text-risk-high' : 'text-signal-good'}
          detail={newFindings ? `${newFindings} new` : 'tracked'}
        />
        <SummaryMetric
          label="warnings"
          value={warnings}
          tone={warnings ? 'text-risk-medium' : 'text-signal-good'}
          detail={warnings ? 'review' : 'clear'}
        />
      </div>

      {techStack.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-sm border border-ink-500/10 bg-paper-50/55 px-3 py-2.5">
          <span className="eyebrow text-[9px] mr-1">tech</span>
          {techStack.map((tech) => (
            <span
              key={tech.name}
              className="inline-flex items-center gap-1.5 rounded-sm border border-ink-500/15 bg-paper-100/70 px-2 py-1 font-mono text-[10px] text-ink-300"
            >
              {tech.name}
              <span className="text-ink-100">{tech.count}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
