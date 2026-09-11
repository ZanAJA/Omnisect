import { useEffect, useState } from 'react';
import { useEscape } from '../hooks/useEscape';
import { api } from '../lib/api';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js';
import X from 'lucide-react/dist/esm/icons/x.js';

const TOOL_INFO = {
  surfaceMapper: 'passive attack-surface mapping and tool planning',
  subfinder: 'subdomain enumeration',
  sublist3r: 'subdomain enumeration fallback',
  ctlog:     'certificate transparency subdomains',
  dnsx:      'dns validation',
  naabu:     'conservative port discovery',
  nmap:      'secondary tcp port discovery',
  httpx:     'http probing & fingerprinting',
  headers:   'security header review',
  takeover:  'subdomain takeover heuristics',
  tlsx:      'tls and certificate metadata',
  gau:       'passive url discovery',
  wayback:   'Wayback Machine endpoints',
  urlscan:   'urlscan.io observed URLs',
  robots:    'robots.txt and sitemap URLs',
  ffuf:      'content and path discovery',
  katana:    'active crawler',
  nuclei:    'cve & template-based scanning',
  sqli:      'sql injection detection',
  xss:       'cross-site scripting',
  idor:      'insecure direct object reference',
};

const TOOL_STATUS_KEY = {
  surfaceMapper: 'surface-mapper',
  sqli: 'curl',
  xss: 'curl',
  idor: 'curl',
};

export default function ScanConfig({ config, onSave, onClose, embedded = false }) {
  const [draft, setDraft] = useState({ ...config });
  const [toolState, setToolState] = useState({ loading: true, tools: {}, missing: [], error: '' });
  useEscape(onClose, !embedded);

  const refreshTools = async () => {
    setToolState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const data = await api.toolStatus(true);
      setToolState({ loading: false, tools: data.tools || {}, missing: data.missing || [], error: '' });
    } catch (err) {
      setToolState({ loading: false, tools: {}, missing: [], error: err.message || String(err) });
    }
  };

  useEffect(() => {
    refreshTools();
  }, []);

  const toggleTool = (tool) => {
    setDraft((p) => ({ ...p, tools: { ...p.tools, [tool]: !p.tools[tool] } }));
  };

  const handleSave = () => { onSave(draft); onClose(); };

  const panel = (
      <div
        className={`paper-card config-panel w-full ${embedded ? 'max-w-none' : 'max-w-3xl shadow-ink-card max-h-[90vh] overflow-y-auto'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {!embedded && (
          <div className="px-7 sm:px-8 pt-6 sm:pt-7 pb-4 sm:pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow mb-2">configuration</p>
                <h2 className="font-sans text-xl sm:text-2xl font-semibold text-ink-500">scan settings</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-mist-300 hover:text-ink-500 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-500"
                aria-label="Close"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="glow-divider mt-5 sm:mt-6 -mx-2" />
          </div>
        )}

        <div className={`${embedded ? 'px-5 sm:px-7 pt-5 sm:pt-6' : 'px-7 sm:px-8'} pb-2 space-y-7`}>
          <div className="config-controls-grid">
            <div className="config-control-cell">
              <div className="flex items-baseline justify-between gap-4 mb-4">
                <div>
                  <p className="eyebrow mb-1">threads</p>
                  <label className="font-sans text-sm font-semibold text-ink-400">concurrency</label>
                </div>
                <p className="font-mono text-2xl font-semibold text-ink-500 leading-none tabular-nums">
                  {draft.threads}
                  <span className="text-[10px] text-mist-300 ml-1.5 font-sans font-semibold">threads</span>
                </p>
              </div>
              <input
                type="range"
                min="10" max="200" step="10"
                value={draft.threads}
                onChange={(e) => setDraft((p) => ({ ...p, threads: Number(e.target.value) }))}
                className="w-full cursor-pointer"
                aria-label="Concurrency"
              />
              <div className="flex justify-between text-[10px] text-mist-300 font-mono mt-2">
                <span>10 / stealth</span>
                <span>200 / maximum</span>
              </div>
            </div>

            <label className="config-control-cell config-aggressive-toggle">
              <input
                type="checkbox"
                checked={!!draft.aggressive}
                onChange={(e) => setDraft((p) => ({ ...p, aggressive: e.target.checked }))}
                className="sr-only"
              />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="eyebrow mb-1">payload mode</p>
                  <p className="font-sans text-sm font-semibold text-ink-400">aggressive SQLi</p>
                  <p className="text-[11px] text-ink-100 mt-1 leading-relaxed">
                    Enables time-based payloads. Use only with explicit authorization.
                  </p>
                </div>
                <div className={`config-switch ${draft.aggressive ? 'is-on' : ''}`} aria-hidden="true">
                  <span />
                </div>
              </div>
            </label>

            <label className="config-control-cell config-aggressive-toggle">
              <input
                type="checkbox"
                checked={draft.adaptivePlanning !== false}
                onChange={(e) => setDraft((p) => ({ ...p, adaptivePlanning: e.target.checked }))}
                className="sr-only"
              />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="eyebrow mb-1">planner</p>
                  <p className="font-sans text-sm font-semibold text-ink-400">surface-guided tools</p>
                  <p className="text-[11px] text-ink-100 mt-1 leading-relaxed">
                    Map the web surface first, then run checks supported by observed evidence.
                  </p>
                </div>
                <div className={`config-switch ${draft.adaptivePlanning !== false ? 'is-on' : ''}`} aria-hidden="true">
                  <span />
                </div>
              </div>
            </label>
          </div>

          <div>
            <div className="mb-4">
              <p className="eyebrow mb-1">smart-scan budgets</p>
              <h4 className="font-sans text-sm font-semibold text-ink-400">bounded discovery and planning</h4>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['surfaceMaxPages', 'initial pages', 1, 50],
                ['surfaceSecondaryHosts', 'secondary origins', 0, 10],
                ['smartMaxEndpoints', 'planned endpoints', 25, 1000],
                ['smartMaxRequests', 'estimated requests', 100, 10000],
              ].map(([key, label, min, max]) => (
                <label key={key} className="block">
                  <span className="eyebrow mb-2 block">{label}</span>
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={draft[key]}
                    onChange={(e) => setDraft((current) => ({
                      ...current,
                      [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)),
                    }))}
                    className="input-ink w-full px-3 py-2.5 font-mono text-xs"
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow mb-1">tools</p>
                <h4 className="font-sans text-sm font-semibold text-ink-400">active tools</h4>
              </div>
              <button
                type="button"
                onClick={refreshTools}
                className="icon-button"
                aria-label="Refresh tool availability"
                title="Refresh tool availability"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${toolState.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className={`status-chip ${toolState.missing.length ? 'border-risk-medium/35 bg-risk-medium/[0.08] text-risk-medium' : 'border-signal-good/35 bg-signal-good/[0.06] text-signal-good'}`}>
                {toolState.loading ? 'checking tools' : toolState.error ? 'tool check failed' : toolState.missing.length ? `${toolState.missing.length} unavailable` : 'tools ready'}
              </span>
            </div>
            <div className="config-table-wrap">
              <table className="config-tools-table">
                <thead>
                  <tr>
                    <th scope="col">Enabled</th>
                    <th scope="col">Tool</th>
                    <th scope="col">Purpose</th>
                    <th scope="col">Runtime</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(TOOL_INFO).map((tool) => {
                    const on = draft.tools[tool];
                    const statusKey = TOOL_STATUS_KEY[tool] || tool;
                    const status = toolState.tools[statusKey];
                    const ready = status === true;
                    const unavailable = status === false;
                    const runtimeLabel = ready
                      ? (['surfaceMapper', 'naabu', 'tlsx', 'ctlog', 'headers', 'takeover', 'wayback', 'urlscan', 'robots'].includes(tool) ? 'ready / local' : 'ready')
                      : unavailable ? 'missing' : 'unknown';

                    return (
                      <tr key={tool} className={on ? '' : 'is-disabled'}>
                        <td>
                          <label className="config-table-toggle">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleTool(tool)}
                              className="sr-only"
                              aria-label={`${on ? 'Disable' : 'Enable'} ${tool}`}
                            />
                            <span className={`config-switch ${on ? 'is-on' : ''}`} aria-hidden="true">
                              <span />
                            </span>
                          </label>
                        </td>
                        <td><span className="config-tool-name">{tool}</span></td>
                        <td><span className="config-tool-purpose">{TOOL_INFO[tool]}</span></td>
                        <td>
                          <span className={`config-runtime ${ready ? 'is-ready' : unavailable ? 'is-missing' : ''}`}>
                            <span aria-hidden="true" />
                            {runtimeLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="px-7 sm:px-8 pt-6 pb-5 sm:pb-6 mt-3 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="font-sans text-sm font-semibold text-ink-200 hover:text-ink-500 transition-colors px-4 py-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-500"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-ink px-7 sm:px-9 py-2.5 sm:py-3 rounded-sm uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
          >
            save
          </button>
        </div>
      </div>
  );

  if (embedded) return panel;

  return (
    <div
      className="fixed inset-0 bg-paper-100/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      {panel}
    </div>
  );
}
