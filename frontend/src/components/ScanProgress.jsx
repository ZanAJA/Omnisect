import { useEffect, useRef, useState } from 'react';
import AnimatedNumber from './AnimatedNumber';
import GlowDivider from './GlowDivider';
import { useTickingValue } from '../hooks/useTickingValue';

const PHASE_LABELS = {
  surface:      'attack-surface map',
  subdomains:   'subdomain discovery',
  sublist3r:    'sublist3r discovery',
  ctlog:        'certificate logs',
  dnsx:         'dns validation',
  ports:        'port discovery',
  nmap:         'nmap port scan',
  probe:        'http probing',
  headers:      'security headers',
  takeover:     'takeover checks',
  tls:          'tls metadata',
  crawl:        'endpoint crawl',
  wayback:      'wayback urls',
  urlscan:      'urlscan urls',
  robots:       'robots + sitemaps',
  ffuf:         'ffuf paths',
  katana:       'active crawl',
  technologies: 'tech fingerprint',
  nuclei:       'cve scanning',
  sqli:         'sql injection',
  xss:          'cross-site scripting',
  idor:         'idor probe',
};

const PHASE_ORDER = [
  'surface', 'subdomains', 'sublist3r', 'ctlog', 'dnsx', 'takeover', 'ports', 'nmap',
  'probe', 'headers', 'tls', 'crawl', 'wayback', 'urlscan', 'robots', 'ffuf',
  'katana', 'technologies', 'nuclei', 'sqli', 'xss', 'idor',
];

const STATE_STYLES = {
  done:    { ink: 'bg-signal-good',   width: '100%', text: 'text-signal-good',    label: 'done',    card: 'border-signal-good/40 bg-signal-good/[0.08]' },
  running: { ink: 'bg-ink-500',       width: '64%',  text: 'text-ink-500',        label: 'running', card: 'border-ink-500/35 bg-ink-500/[0.08]' },
  error:   { ink: 'bg-signal-bad',    width: '100%', text: 'text-signal-bad',     label: 'error',   card: 'border-signal-bad/45 bg-signal-bad/[0.10]' },
  skipped: { ink: 'bg-mist-200',      width: '100%', text: 'text-mist-300',       label: 'skipped', card: 'border-ink-500/10 bg-paper-50/70' },
  pending: { ink: 'bg-mist-200',      width: '0%',   text: 'text-ink-100',        label: 'pending', card: 'border-ink-500/15 bg-paper-50' },
};

const WARNING_BUCKETS = {
  missing: { label: 'tool missing', tone: 'text-risk-medium', badge: 'border-risk-medium/35 bg-risk-medium/[0.08]' },
  timeout: { label: 'timed out', tone: 'text-risk-medium', badge: 'border-risk-medium/35 bg-risk-medium/[0.08]' },
  skipped: { label: 'skipped', tone: 'text-ink-200', badge: 'border-ink-500/15 bg-paper-50/75' },
  error:   { label: 'scan error', tone: 'text-signal-bad', badge: 'border-signal-bad/35 bg-signal-bad/[0.08]' },
};

function classifyWarning(message) {
  const text = String(message || '');
  if (/unavailable|install:/i.test(text)) return 'missing';
  if (/timed out|timeout|cap/i.test(text)) return 'timeout';
  if (/skipped|continuing|partial/i.test(text)) return 'skipped';
  return 'error';
}

function groupWarnings(errors = []) {
  return errors.reduce((groups, message) => {
    const type = classifyWarning(message);
    if (!groups[type]) groups[type] = [];
    groups[type].push(message);
    return groups;
  }, {});
}

function progressTone(status) {
  if (status === 'completed') return 'from-signal-good via-signal-good to-signal-good';
  if (status === 'failed') return 'from-signal-bad via-risk-high to-signal-bad';
  if (status === 'cancelled') return 'from-risk-medium via-risk-medium to-risk-medium';
  if (status === 'queued') return 'from-risk-info via-risk-info to-ink-300';
  return 'from-ink-500 via-ink-500 to-ink-300';
}

function glowTone(status) {
  if (status === 'completed') return 'bg-signal-good';
  if (status === 'failed') return 'bg-signal-bad';
  if (status === 'cancelled') return 'bg-risk-medium';
  if (status === 'queued') return 'bg-risk-info';
  return 'bg-ink-500';
}

function PhaseRow({ name, state }) {
  const s = STATE_STYLES[state] || STATE_STYLES.pending;
  const done = state === 'done';
  const running = state === 'running';

  // Detect the moment a phase transitions to 'done' so we can flash a soft
  // green sweep across the card. Reset after the animation completes.
  const prevState = useRef(state);
  const [justDone, setJustDone] = useState(false);
  useEffect(() => {
    if (prevState.current !== 'done' && state === 'done') {
      setJustDone(true);
      const t = setTimeout(() => setJustDone(false), 900);
      prevState.current = state;
      return () => clearTimeout(t);
    }
    prevState.current = state;
    return undefined;
  }, [state]);

  return (
    <div
      className={`phase-card rounded-sm border px-3 py-2.5 transition-all duration-300 ${s.card}`}
      data-phase={name}
      data-running={running ? 'true' : 'false'}
      data-just-done={justDone ? 'true' : 'false'}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-2">
          <span className="phase-glyph mt-0.5" aria-hidden="true" />
          <span className={`font-sans text-[13px] sm:text-sm font-semibold transition-colors duration-300 leading-tight ${
            done || running ? 'text-ink-500' : 'text-ink-200'
          }`}>
            {PHASE_LABELS[name] || name}
          </span>
        </span>
        <span className={`text-[10px] font-mono transition-colors duration-300 ${s.text} ${running ? 'animate-breathe' : ''}`}>
          {s.label}
        </span>
      </div>
      <div className="relative h-1 bg-mist-100/70 rounded-full overflow-hidden mt-2.5">
        <div
          className={`absolute inset-y-0 left-0 ${s.ink} transition-all duration-700 ease-out`}
          style={{ width: s.width }}
        />
        {running && <div className="energy-flow" style={{ width: s.width }} />}
      </div>
    </div>
  );
}

export default function ScanProgress({ job, onCancel }) {
  const {
    progress, phase, phases, status, subdomains, openPorts, liveHosts, tls,
    endpoints, attackSurface, attackGraph, planningHistory, toolPlan, coverage, errors,
  } = job;
  const isRunning = status === 'running';
  const isActive = status === 'running' || status === 'queued';
  const warningGroups = groupWarnings(errors || []);
  // Step the % up one integer at a time so the user reads it enumerating, and
  // use the same value for the bar so number + fill animate in lockstep.
  const tick = useTickingValue(progress, 70);

  return (
    <section className="paper-card p-5 sm:p-6">
      <div className="flex items-end justify-between gap-3 mb-5 sm:mb-6">
        <div className="min-w-0">
          <p className="eyebrow mb-2">progress</p>
          <h3 className="font-sans text-lg sm:text-xl font-semibold text-ink-500 truncate">
            {status === 'completed' ? 'scan complete'
              : status === 'cancelled' ? 'scan cancelled'
              : status === 'failed' ? 'scan failed'
              : status === 'queued' ? `queued${job.queuePosition ? ` / position ${job.queuePosition}` : ''}`
              : `running / ${phase}`}
          </h3>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-mono text-3xl sm:text-4xl font-semibold text-ink-500 leading-none tabular-nums">
            <span>{tick}</span>
            <span className="text-sm sm:text-lg text-ink-200 ml-1">%</span>
          </p>
        </div>
      </div>

      <div className="relative h-[3px] bg-mist-100 rounded-sm overflow-hidden mb-5 sm:mb-6">
        <div
          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${progressTone(status)}`}
          style={{ width: `${tick}%`, transition: 'width 70ms linear' }}
        />
        <div
          className={`absolute -inset-y-1.5 left-0 ${glowTone(status)} opacity-25 blur-md`}
          style={{ width: `${tick}%`, transition: 'width 70ms linear' }}
        />
        {isRunning && tick < 100 && <div className="energy-flow" style={{ width: `${tick}%` }} />}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {PHASE_ORDER.map((name) => (
          <PhaseRow key={name} name={name} state={phases?.[name] || 'pending'} />
        ))}
      </div>

      {toolPlan && (
        <>
          <div className="my-5 sm:my-6"><GlowDivider variant="soft" delay={250} /></div>
          <div className="rounded-sm border border-ink-500/15 bg-paper-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow mb-1">surface-guided plan</p>
                <p className="font-sans text-sm font-semibold text-ink-400">
                  {toolPlan.mode === 'adaptive' ? 'tools selected from observed evidence' : 'configured tools run without gating'}
                </p>
              </div>
              <span className={`status-chip ${toolPlan.evidenceAvailable ? 'border-signal-good/35 bg-signal-good/[0.06] text-signal-good' : 'border-risk-medium/35 bg-risk-medium/[0.08] text-risk-medium'}`}>
                {toolPlan.evidenceAvailable ? 'surface mapped' : 'fallback plan'}
              </span>
            </div>
            {attackSurface?.summary && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wide text-ink-200">
                <span>{attackSurface.summary.pages || 0} pages</span>
                <span>{attackSurface.summary.forms || 0} forms</span>
                <span>{attackSurface.summary.apiEndpoints || 0} api endpoints</span>
                <span>{attackSurface.summary.websockets || 0} websockets</span>
                <span>{attackSurface.summary.findings || 0} review signals</span>
                <span>{attackGraph?.summary?.parameter || 0} parameters</span>
                <span>{planningHistory?.length || 0} planning passes</span>
              </div>
            )}
            {toolPlan.scanPacks?.length > 0 && (
              <div className="mt-3">
                <p className="eyebrow mb-2">technology packs</p>
                <div className="flex flex-wrap gap-1.5">
                  {toolPlan.scanPacks.map((pack) => (
                    <span key={pack.id} className="status-chip border-risk-info/30 bg-risk-info/[0.06] text-risk-info" title={pack.reason}>
                      {pack.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {toolPlan.unavailableTools?.length > 0 && (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-risk-medium">
                unavailable runtime / {toolPlan.unavailableTools.join(', ')}
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="eyebrow mb-2 text-signal-good">selected ({toolPlan.selectedTools?.length || 0})</p>
                <div className="flex flex-wrap gap-1.5">
                  {(toolPlan.selectedTools || []).map((tool) => (
                    <span
                      key={tool}
                      className="status-chip border-signal-good/25 bg-signal-good/[0.05] text-signal-good"
                      title={toolPlan.decisions?.[tool]?.reason}
                    >
                      {tool} / {Math.round((toolPlan.decisions?.[tool]?.confidence || 0) * 100)}%
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="eyebrow mb-2 text-ink-200">not indicated ({toolPlan.skippedTools?.length || 0})</p>
                <div className="space-y-1.5">
                  {(toolPlan.skippedTools || []).map((tool) => (
                    <p key={tool} className="text-[11px] font-mono leading-relaxed text-ink-200">
                      <span className="text-ink-400">{tool}</span> / {toolPlan.decisions?.[tool]?.reason}
                    </p>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-500/10 pt-3 font-mono text-[10px] uppercase tracking-wide text-ink-200">
              <span>{toolPlan.endpointPlan?.plans?.length || 0} endpoint plans</span>
              <span>~{toolPlan.budget?.estimatedRequests || 0} estimated requests</span>
              <span>limit {toolPlan.budget?.maxEstimatedRequests || 0}</span>
              <span>rules {toolPlan.ruleDatabase?.version || 'unknown'}</span>
            </div>
            {coverage?.delta && (
              <p className="mt-2 font-mono text-[10px] text-ink-200">
                coverage delta / endpoints {Number(coverage.delta.endpoint || 0) >= 0 ? '+' : ''}{coverage.delta.endpoint || 0}
                {' · '}parameters {Number(coverage.delta.parameter || 0) >= 0 ? '+' : ''}{coverage.delta.parameter || 0}
              </p>
            )}
          </div>
        </>
      )}

      <div className="my-5 sm:my-6"><GlowDivider variant="soft" delay={300} /></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        <Stat eyebrow="surface" label="signals" value={attackSurface?.summary?.findings ?? 0} />
        <Stat eyebrow="subs" label="subdomains" value={subdomains?.length ?? 0} />
        <Stat eyebrow="ports" label="open ports" value={openPorts?.length ?? 0} />
        <Stat eyebrow="hosts" label="live hosts" value={liveHosts?.length ?? 0} />
        <Stat eyebrow="tls" label="certs" value={tls?.length ?? 0} />
        <Stat eyebrow="urls" label="endpoints"  value={endpoints?.length ?? 0} />
      </div>

      {errors?.length > 0 && (
        <>
          <div className="my-5 sm:my-6"><GlowDivider variant="soft" delay={500} /></div>
          <div>
            <p className="eyebrow mb-3 text-risk-medium">warnings ({errors.length})</p>
            <div className="space-y-3 max-h-40 overflow-y-auto pr-2">
              {Object.entries(warningGroups).map(([type, messages]) => {
                const bucket = WARNING_BUCKETS[type] || WARNING_BUCKETS.error;
                return (
                  <div key={type} className={`rounded-sm border px-3 py-2 ${bucket.badge}`}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className={`eyebrow text-[9px] ${bucket.tone}`}>{bucket.label}</span>
                      <span className={`font-mono text-[10px] ${bucket.tone}`}>{messages.length}</span>
                    </div>
                    <div className="space-y-1">
                      {messages.map((e, i) => (
                        <p key={i} className={`text-[11px] font-mono leading-relaxed break-words ${bucket.tone}`}>{e}</p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {isActive && onCancel && (
        <div className="hidden sm:flex justify-end mt-6">
          <button
            onClick={onCancel}
            className="text-xs font-sans font-semibold text-ink-200 hover:text-ink-500 border-b border-ink-200/40 hover:border-ink-500 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-500"
          >
            {status === 'queued' ? 'cancel queued scan' : 'cancel this scan'}
          </button>
        </div>
      )}
    </section>
  );
}

function Stat({ eyebrow, label, value }) {
  return (
    <div className="metric-tile text-center group">
      <p className="font-mono text-2xl sm:text-3xl font-semibold text-ink-500 leading-none tabular-nums transition-transform duration-300 group-hover:scale-105">
        <AnimatedNumber value={value} duration={900} />
      </p>
      <div className="mt-2 sm:mt-3 space-y-0.5">
        <p className="eyebrow text-[9px] sm:text-[10px]">{eyebrow}</p>
        <p className="font-sans text-[11px] sm:text-xs text-ink-200">{label}</p>
      </div>
    </div>
  );
}
