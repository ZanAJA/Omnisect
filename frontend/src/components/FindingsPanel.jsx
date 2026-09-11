import { useEffect, useMemo, useRef, useState } from 'react';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.js';
import AnimatedNumber from './AnimatedNumber';

// Tracks which finding IDs are "newly arrived" so we can play the shimmer
// animation only on freshly-pushed findings, not on every re-render or filter
// change. Returns a Set of IDs that should currently animate.
function useFreshFindingIds(findings) {
  const seenRef = useRef(null);
  const [fresh, setFresh] = useState(() => new Set());

  useEffect(() => {
    const ids = Object.values(findings || {})
      .flat()
      .map((f) => f?.id || f?.fingerprint)
      .filter(Boolean);

    // First render: baseline — every current finding is "already seen", no animation.
    if (seenRef.current === null) {
      seenRef.current = new Set(ids);
      return undefined;
    }

    const newOnes = ids.filter((id) => !seenRef.current.has(id));
    if (newOnes.length === 0) return undefined;

    newOnes.forEach((id) => seenRef.current.add(id));
    setFresh((prev) => {
      const next = new Set(prev);
      newOnes.forEach((id) => next.add(id));
      return next;
    });

    const t = setTimeout(() => {
      setFresh((prev) => {
        const next = new Set(prev);
        newOnes.forEach((id) => next.delete(id));
        return next;
      });
    }, 1300);
    return () => clearTimeout(t);
  }, [findings]);

  return fresh;
}

const DEFAULT_FILTER = { search: '', severity: 'all', type: 'all', newOnly: false };

const SEVERITY_CONFIG = {
  critical: { label: 'critical', badge: 'bg-risk-critical text-paper-50', border: 'border-l-risk-critical', accent: 'text-risk-critical', rule: 'bg-risk-critical', wash: 'bg-risk-critical/10' },
  high:     { label: 'high',     badge: 'bg-risk-high text-paper-50', border: 'border-l-risk-high', accent: 'text-risk-high', rule: 'bg-risk-high', wash: 'bg-risk-high/10' },
  medium:   { label: 'medium',   badge: 'bg-paper-50 border border-risk-medium/35 text-risk-medium', border: 'border-l-risk-medium', accent: 'text-risk-medium', rule: 'bg-risk-medium', wash: 'bg-risk-medium/[0.07]' },
  low:      { label: 'low',      badge: 'bg-paper-50 border border-risk-low/35 text-risk-low', border: 'border-l-risk-low', accent: 'text-risk-low', rule: 'bg-risk-low', wash: 'bg-risk-low/[0.06]' },
  info:     { label: 'info',     badge: 'bg-paper-50 border border-risk-info/30 text-risk-info', border: 'border-l-risk-info', accent: 'text-risk-info', rule: 'bg-risk-info', wash: 'bg-risk-info/[0.06]' },
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const TYPE_LABELS = { nuclei: 'nuclei', sqli: 'sqli', xss: 'xss', idor: 'idor', headers: 'headers', takeover: 'takeover' };
const TYPE_ORDER = ['nuclei', 'sqli', 'xss', 'idor', 'headers', 'takeover'];
const TRIAGE_STATUSES = ['new', 'reviewing', 'confirmed', 'false_positive', 'reported', 'resolved'];

function mergeFilter(filter) {
  return { ...DEFAULT_FILTER, ...(filter || {}) };
}

function flattenFindings(findings = {}) {
  return SEVERITY_ORDER.flatMap((severity) => (
    (findings[severity] || []).map((finding) => ({ ...finding, severity: finding.severity || severity }))
  ));
}

function textForFinding(finding) {
  return [
    finding.name,
    finding.description,
    finding.url,
    finding.testUrl,
    finding.template,
    finding.type,
    finding.severity,
    finding.payload,
    finding.evidence,
    finding.triage?.status,
    finding.triage?.notes,
  ].filter(Boolean).join(' ').toLowerCase();
}

function withPayload(url, payload) {
  if (!url || !payload) return url;
  try {
    const parsed = new URL(url);
    const firstKey = [...parsed.searchParams.keys()][0];
    if (!firstKey) return url;
    parsed.searchParams.set(firstKey, `${parsed.searchParams.get(firstKey) || ''}${payload}`);
    return parsed.toString();
  } catch {
    return url;
  }
}

function shellQuote(value) {
  return `"${String(value || '').replace(/"/g, '\\"')}"`;
}

function reproduceCurl(finding) {
  if (finding.reproduceCurl) return finding.reproduceCurl;
  const url = finding.testUrl || withPayload(finding.url, finding.payload) || finding.url;
  return `curl -i -L --max-time 10 -H "User-Agent: Mozilla/5.0" ${shellQuote(url)}`;
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

async function copyToClipboard(value) {
  const text = String(value || '');
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  }
}

function CopyButton({ value, label = 'Copy', onCopy }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event) => {
    event.stopPropagation();
    const ok = await copyToClipboard(value);
    if (!ok) return;
    setCopied(true);
    onCopy?.(label);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-7 items-center justify-center rounded-sm border border-ink-500/15 bg-paper-50/80 px-2 font-mono text-[10px] uppercase text-ink-200 transition-colors hover:border-ink-500/40 hover:text-ink-500 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-500"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
    >
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

function FieldRow({ label, value, code = false, onCopy }) {
  if (!value) return null;
  return (
    <div className="rounded-sm border border-ink-500/10 bg-paper-50/65 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="eyebrow text-[10px]">{label}</span>
        <CopyButton value={value} label={label} onCopy={onCopy} />
      </div>
      {code ? (
        <code className="block font-mono text-[11px] leading-relaxed text-ink-300 break-all">{value}</code>
      ) : (
        <p className="font-mono text-[11px] leading-relaxed text-ink-300 break-all">{value}</p>
      )}
    </div>
  );
}

function FindingCard({ finding, config, index, onCopy, onTriageChange, fresh = false }) {
  const [expanded, setExpanded] = useState(false);
  const curl = reproduceCurl(finding);
  const [triage, setTriage] = useState(() => ({
    status: finding.triage?.status || 'new',
    severityOverride: finding.triage?.severityOverride || '',
    notes: finding.triage?.notes || '',
  }));

  useEffect(() => {
    setTriage({
      status: finding.triage?.status || 'new',
      severityOverride: finding.triage?.severityOverride || '',
      notes: finding.triage?.notes || '',
    });
  }, [finding.id, finding.fingerprint, finding.triage?.status, finding.triage?.severityOverride, finding.triage?.notes]);

  const saveTriage = async (event) => {
    event.stopPropagation();
    await onTriageChange?.(finding, {
      triage: {
        status: triage.status,
        severityOverride: triage.severityOverride || null,
        notes: triage.notes,
      },
    });
  };

  return (
    <article
      className={`finding-card group relative bg-paper-50 hover:bg-paper-200 border border-ink-500/15 border-l-[2px] transition-all duration-300 cursor-pointer rounded-sm hover:border-ink-500/30 hover:shadow-ink-soft ${config.border} ${fresh ? 'finding-card-new' : ''}`}
      onClick={() => setExpanded(!expanded)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setExpanded(!expanded))}
      tabIndex={0}
      aria-expanded={expanded}
      // Skip the staggered liftIn for cards arriving live — the materialize
      // animation in `.finding-card-new` is more dramatic and shouldn't compete.
      style={fresh ? undefined : { animation: `liftIn 0.55s ${index * 35}ms cubic-bezier(0.16, 1, 0.3, 1) backwards` }}
    >
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`text-[10px] uppercase px-2 py-0.5 rounded-sm font-mono ${config.badge}`}>
                {TYPE_LABELS[finding.type] || finding.type}
              </span>
              {finding.isNew && (
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-sm font-mono bg-paper-50 border border-ink-500 text-ink-500 animate-breathe">
                  new
                </span>
              )}
              {finding.template && (
                <span className="text-[10px] text-ink-100 font-mono truncate">
                  {finding.template}
                </span>
              )}
              {finding.triage?.status && finding.triage.status !== 'new' && (
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-sm font-mono bg-paper-50 border border-ink-500/20 text-ink-200">
                  {finding.triage.status.replace('_', ' ')}
                </span>
              )}
            </div>
            <p className="font-sans text-sm sm:text-base font-semibold text-ink-500 leading-snug">
              {finding.name || finding.description || 'vulnerability detected'}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <p className="text-xs text-ink-100 truncate font-mono min-w-0">
                {finding.url}
              </p>
              <CopyButton value={finding.url} label="url" onCopy={onCopy} />
            </div>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-mist-300 group-hover:text-ink-200 flex-shrink-0 mt-2 transition-all duration-300 ${
              expanded ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </div>

        {expanded && (
          <div className={`mt-4 p-3 border-t border-ink-500/10 space-y-3 animate-lift-in rounded-sm ${config.wash}`}>
            {finding.description && finding.name && (
              <p className="text-[13px] text-ink-300 leading-relaxed">{finding.description}</p>
            )}
            <FieldRow label="url" value={finding.url} onCopy={onCopy} />
            <FieldRow label="payload" value={finding.payload} code onCopy={onCopy} />
            <FieldRow label="reproduce curl" value={curl} code onCopy={onCopy} />
            <FieldRow label="evidence" value={finding.evidence} onCopy={onCopy} />
            <FieldRow label="checked url" value={finding.evidenceDetails?.checkedUrl} onCopy={onCopy} />
            <div className="rounded-sm border border-ink-500/10 bg-paper-50/65 p-3" onClick={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="eyebrow text-[10px]">triage</span>
                <button
                  type="button"
                  onClick={saveTriage}
                  className="inline-flex h-7 items-center justify-center rounded-sm border border-ink-500/15 bg-paper-50/80 px-2 font-mono text-[10px] uppercase text-ink-200 transition-colors hover:border-ink-500/40 hover:text-ink-500"
                >
                  save
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={triage.status}
                  onChange={(event) => setTriage((current) => ({ ...current, status: event.target.value }))}
                  className="rounded-sm border border-ink-500/15 bg-paper-100/60 px-2 py-2 font-mono text-[11px] text-ink-500 focus:border-ink-500/40 focus:outline-none"
                >
                  {TRIAGE_STATUSES.map((status) => (
                    <option key={status} value={status}>{status.replace('_', ' ')}</option>
                  ))}
                </select>
                <select
                  value={triage.severityOverride}
                  onChange={(event) => setTriage((current) => ({ ...current, severityOverride: event.target.value }))}
                  className="rounded-sm border border-ink-500/15 bg-paper-100/60 px-2 py-2 font-mono text-[11px] text-ink-500 focus:border-ink-500/40 focus:outline-none"
                >
                  <option value="">severity as detected</option>
                  {SEVERITY_ORDER.map((severity) => (
                    <option key={severity} value={severity}>{severity}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={triage.notes}
                onChange={(event) => setTriage((current) => ({ ...current, notes: event.target.value }))}
                rows="3"
                placeholder="notes for verification or reporting"
                className="mt-2 w-full resize-none rounded-sm border border-ink-500/15 bg-paper-100/60 p-2 font-mono text-[11px] text-ink-500 placeholder-mist-300 focus:border-ink-500/40 focus:outline-none"
              />
            </div>
            {finding.fingerprint && (
              <p className="text-[10px] font-mono text-mist-300">
                fingerprint / {finding.fingerprint}
              </p>
            )}
            {finding.reference && (
              <a
                href={finding.reference}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-ink-500 font-sans font-semibold border-b border-ink-400/30 hover:border-ink-500 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-500"
              >
                reference <span className="text-[10px]">-&gt;</span>
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function SeveritySection({ severity, findings, onCopy, onTriageChange, freshIds }) {
  const [collapsed, setCollapsed] = useState(false);
  const config = SEVERITY_CONFIG[severity];
  if (findings.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-3 mb-4 group focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-500"
        aria-expanded={!collapsed}
      >
        <span className={`text-[10px] uppercase px-2 py-0.5 rounded-sm font-mono ${config.badge}`}>
          {config.label}
        </span>
        <span className="font-mono text-sm font-semibold text-ink-300 tabular-nums">
          <AnimatedNumber value={findings.length} duration={500} />
        </span>
        <ChevronDown
          className={`w-3 h-3 text-mist-300 group-hover:text-ink-200 transition-all duration-300 ${collapsed ? '-rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {findings.map((f, i) => {
            const fid = f.id || f.fingerprint;
            const fresh = !!(freshIds && fid && freshIds.has(fid));
            return (
              <FindingCard
                key={fid || i}
                finding={f}
                config={config}
                index={i}
                onCopy={onCopy}
                onTriageChange={onTriageChange}
                fresh={fresh}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterButton({ active, disabled, children, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-sm border px-2.5 py-1.5 font-mono text-[10px] uppercase transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-500 ${
        active ? 'border-ink-500/45 bg-ink-500/10 text-ink-500' : 'border-ink-500/15 bg-paper-50 text-ink-200 hover:border-ink-500/35 hover:text-ink-500'
      } ${disabled ? 'opacity-35 cursor-not-allowed hover:border-ink-500/15 hover:text-ink-200' : ''}`}
    >
      {children}
    </button>
  );
}

export default function FindingsPanel({ findings = {}, filter, onFilterChange, onCopy, onTriageChange }) {
  const activeFilter = mergeFilter(filter);
  const allFindings = useMemo(() => flattenFindings(findings), [findings]);
  const freshIds = useFreshFindingIds(findings);
  const total = allFindings.length;
  const newCount = allFindings.filter((f) => f.isNew).length;

  const filteredFindings = useMemo(() => {
    const q = activeFilter.search.trim().toLowerCase();
    return allFindings.filter((finding) => {
      if (activeFilter.severity !== 'all' && finding.severity !== activeFilter.severity) return false;
      if (activeFilter.type !== 'all' && finding.type !== activeFilter.type) return false;
      if (activeFilter.newOnly && !finding.isNew) return false;
      if (q && !textForFinding(finding).includes(q)) return false;
      return true;
    });
  }, [activeFilter.newOnly, activeFilter.search, activeFilter.severity, activeFilter.type, allFindings]);

  const grouped = useMemo(() => {
    const result = Object.fromEntries(SEVERITY_ORDER.map((severity) => [severity, []]));
    filteredFindings.forEach((finding) => {
      if (!result[finding.severity]) result[finding.severity] = [];
      result[finding.severity].push(finding);
    });
    return result;
  }, [filteredFindings]);

  const counts = useMemo(() => {
    const result = Object.fromEntries(SEVERITY_ORDER.map((severity) => [severity, 0]));
    allFindings.forEach((finding) => { result[finding.severity] = (result[finding.severity] || 0) + 1; });
    return result;
  }, [allFindings]);

  const typeCounts = useMemo(() => {
    const result = Object.fromEntries(TYPE_ORDER.map((type) => [type, 0]));
    allFindings.forEach((finding) => { result[finding.type] = (result[finding.type] || 0) + 1; });
    return result;
  }, [allFindings]);

  const updateFilter = (patch) => onFilterChange?.({ ...activeFilter, ...patch });
  const clearFilters = () => onFilterChange?.(DEFAULT_FILTER);
  const hasFilters = activeFilter.search || activeFilter.severity !== 'all' || activeFilter.type !== 'all' || activeFilter.newOnly;
  const visibleUrls = useMemo(() => uniqueValues(filteredFindings.map((finding) => finding.url)), [filteredFindings]);
  const visibleCurl = useMemo(() => uniqueValues(filteredFindings.map(reproduceCurl)), [filteredFindings]);
  const copyBulk = async (label, values) => {
    const ok = await copyToClipboard(values.join('\n'));
    if (ok) onCopy?.(label);
  };

  if (total === 0) {
    return (
      <section className="paper-card p-10 sm:p-12 text-center border-signal-good/30 bg-signal-good/[0.04]">
        <p className="eyebrow mb-3 text-signal-good">clear</p>
        <p className="font-sans text-base text-signal-good text-balance">no findings yet</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="paper-card p-5 sm:p-6">
        <div className="flex items-end justify-between gap-3 mb-5">
          <div className="min-w-0">
            <p className="eyebrow mb-2">overview</p>
            <h3 className="font-sans text-lg sm:text-xl font-semibold text-ink-500">findings</h3>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-mono text-3xl sm:text-4xl font-semibold text-ink-500 leading-none tabular-nums">
              <AnimatedNumber value={filteredFindings.length} duration={900} />
            </p>
            <p className="text-[10px] font-mono text-ink-100 mt-1">
              {hasFilters ? `shown / ${total} total` : newCount > 0 ? <><AnimatedNumber value={newCount} /> new / {total - newCount} known</> : 'total'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5">
          {SEVERITY_ORDER.map((sev) => {
            const count = counts[sev] ?? 0;
            const cfg = SEVERITY_CONFIG[sev];
            const dim = count === 0;
            return (
              <button
                key={sev}
                type="button"
                disabled={count === 0}
                onClick={() => updateFilter({ severity: activeFilter.severity === sev ? 'all' : sev })}
                className={`text-center relative pt-3 pb-2.5 rounded-sm group transition-all duration-300 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500 ${
                  activeFilter.severity === sev ? `${cfg.wash} border border-ink-500/10` : 'border border-transparent'
                } ${count === 0 ? 'cursor-default hover:translate-y-0' : ''}`}
              >
                <div className={`absolute top-0 left-1 right-1 sm:left-2 sm:right-2 h-[2px] ${cfg.rule} ${dim ? 'opacity-25' : 'opacity-90'}`} />
                <p className={`font-mono text-xl sm:text-3xl font-semibold tabular-nums leading-none ${dim ? 'text-ink-100' : cfg.accent}`}>
                  <AnimatedNumber value={count} duration={800} />
                </p>
                <p className="eyebrow mt-1.5 sm:mt-2">{cfg.label}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 space-y-3">
          <input
            type="search"
            value={activeFilter.search}
            onChange={(event) => updateFilter({ search: event.target.value })}
            placeholder="search name, url, payload..."
            className="input-ink w-full px-1 py-2 font-mono text-sm"
            aria-label="Search findings"
          />
          <div className="flex flex-wrap gap-2">
            <FilterButton active={activeFilter.newOnly} disabled={newCount === 0} onClick={() => updateFilter({ newOnly: !activeFilter.newOnly })}>
              new
            </FilterButton>
            <FilterButton active={activeFilter.type === 'all'} onClick={() => updateFilter({ type: 'all' })}>
              all types
            </FilterButton>
            {TYPE_ORDER.map((type) => (
              <FilterButton key={type} active={activeFilter.type === type} disabled={!typeCounts[type]} onClick={() => updateFilter({ type })}>
                {type}
              </FilterButton>
            ))}
            <FilterButton active={false} disabled={!visibleUrls.length} onClick={() => copyBulk('visible urls', visibleUrls)}>
              copy urls
            </FilterButton>
            <FilterButton active={false} disabled={!visibleCurl.length} onClick={() => copyBulk('visible curl', visibleCurl)}>
              copy curl
            </FilterButton>
            {hasFilters && (
              <FilterButton active={false} onClick={clearFilters}>
                clear
              </FilterButton>
            )}
          </div>
        </div>
      </section>

      <section className="paper-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <p className="eyebrow">details</p>
          <p className="font-mono text-[10px] text-ink-100">
            {filteredFindings.length} visible
          </p>
        </div>
        {filteredFindings.length ? (
          <div className="space-y-7 sm:space-y-8">
            {SEVERITY_ORDER.map((sev) => (
              <SeveritySection key={sev} severity={sev} findings={grouped[sev] || []} onCopy={onCopy} onTriageChange={onTriageChange} freshIds={freshIds} />
            ))}
          </div>
        ) : (
          <div className="py-10 text-center">
            <p className="eyebrow mb-2">empty</p>
            <p className="text-sm text-ink-200">no findings match those filters</p>
          </div>
        )}
      </section>
    </div>
  );
}
