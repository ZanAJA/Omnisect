import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const TOOL_KEYS = [
  'surfaceMapper',
  'subfinder', 'sublist3r', 'ctlog', 'dnsx', 'naabu', 'nmap', 'httpx', 'headers',
  'takeover', 'tlsx', 'gau', 'wayback', 'urlscan', 'robots', 'ffuf', 'katana',
  'nuclei', 'sqli', 'xss', 'idor',
];

const EMPTY_SETTINGS = {
  config: {
    threads: null,
    aggressive: null,
    adaptivePlanning: null,
    surfaceMaxPages: null,
    surfaceSecondaryHosts: null,
    smartMaxEndpoints: null,
    smartMaxRequests: null,
    tools: {},
  },
  auth: { headers: [], cookie: '' },
  notifications: { webhookUrl: '', highSeverityOnly: true },
};

function normalizeSettings(settings = {}) {
  return {
    config: {
      threads: settings.config?.threads ?? null,
      aggressive: settings.config?.aggressive ?? null,
      adaptivePlanning: settings.config?.adaptivePlanning ?? null,
      surfaceMaxPages: settings.config?.surfaceMaxPages ?? null,
      surfaceSecondaryHosts: settings.config?.surfaceSecondaryHosts ?? null,
      smartMaxEndpoints: settings.config?.smartMaxEndpoints ?? null,
      smartMaxRequests: settings.config?.smartMaxRequests ?? null,
      tools: { ...(settings.config?.tools || {}) },
    },
    auth: {
      headers: Array.isArray(settings.auth?.headers) ? settings.auth.headers : [],
      cookie: settings.auth?.cookie || '',
    },
    notifications: {
      webhookUrl: settings.notifications?.webhookUrl || '',
      highSeverityOnly: settings.notifications?.highSeverityOnly !== false,
    },
  };
}

function Select({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-sm border border-ink-500/15 bg-paper-100/60 px-3 py-2.5 font-mono text-xs text-ink-500 focus:border-ink-500/40 focus:outline-none"
      >
        {children}
      </select>
    </label>
  );
}

export default function TargetSettings({ target, onClose, onSaved }) {
  const [draft, setDraft] = useState(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) {
      setDraft(EMPTY_SETTINGS);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    api.getTargetSettings(target).then((settings) => {
      if (!cancelled) setDraft(normalizeSettings(settings));
    }).catch((err) => {
      if (!cancelled) setError(err.message || String(err));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [target]);

  const headerRows = useMemo(() => {
    const rows = draft.auth.headers.length ? draft.auth.headers : [{ name: '', value: '' }];
    return rows;
  }, [draft.auth.headers]);

  const setToolOverride = (tool, value) => {
    setDraft((current) => {
      const tools = { ...(current.config.tools || {}) };
      if (value === 'inherit') delete tools[tool];
      else tools[tool] = value === 'on';
      return { ...current, config: { ...current.config, tools } };
    });
  };

  const updateHeader = (index, patch) => {
    setDraft((current) => {
      const headers = [...headerRows];
      headers[index] = { ...headers[index], ...patch };
      return { ...current, auth: { ...current.auth, headers } };
    });
  };

  const removeHeader = (index) => {
    setDraft((current) => ({
      ...current,
      auth: { ...current.auth, headers: current.auth.headers.filter((_, i) => i !== index) },
    }));
  };

  const addHeader = () => {
    setDraft((current) => ({
      ...current,
      auth: { ...current.auth, headers: [...current.auth.headers, { name: '', value: '' }] },
    }));
  };

  const save = async () => {
    if (!target) return;
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveTargetSettings(target, draft);
      setDraft(normalizeSettings(saved));
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!target) return;
    setSaving(true);
    setError('');
    try {
      await api.deleteTargetSettings(target);
      setDraft(EMPTY_SETTINGS);
      onSaved?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!target) {
    return (
      <section className="paper-card max-w-5xl mx-auto p-8 text-center">
        <p className="eyebrow mb-2">target settings</p>
        <p className="text-sm text-ink-200">select a target first</p>
      </section>
    );
  }

  return (
    <section className="paper-card max-w-5xl mx-auto overflow-hidden">
      <div className="px-7 sm:px-8 pt-6 sm:pt-7 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow mb-2">target override</p>
            <h2 className="font-sans text-xl sm:text-2xl font-semibold text-ink-500 break-all">{target}</h2>
            <p className="mt-2 text-xs text-ink-200 leading-relaxed">
              Cookies, headers, webhook alerts, and optional scan overrides for this target only.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-mist-300 transition-colors hover:text-ink-500 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-500"
          >
            back
          </button>
        </div>
        <div className="glow-divider mt-5 sm:mt-6 -mx-2" />
      </div>

      {loading ? (
        <p className="px-7 sm:px-8 py-10 text-center text-sm text-ink-200">loading...</p>
      ) : (
        <div className="px-7 sm:px-8 pb-2 space-y-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="eyebrow mb-2 block">threads</span>
              <input
                type="number"
                min="1"
                max="500"
                value={draft.config.threads ?? ''}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  config: { ...current.config, threads: event.target.value ? Number(event.target.value) : null },
                }))}
                placeholder="inherit global"
                className="input-ink w-full px-3 py-2.5 font-mono text-xs"
              />
            </label>
            <Select
              label="aggressive sqli"
              value={draft.config.aggressive === null ? 'inherit' : draft.config.aggressive ? 'on' : 'off'}
              onChange={(value) => setDraft((current) => ({
                ...current,
                config: { ...current.config, aggressive: value === 'inherit' ? null : value === 'on' },
              }))}
            >
              <option value="inherit">inherit global</option>
              <option value="off">off for this target</option>
              <option value="on">on for this target</option>
            </Select>
            <Select
              label="adaptive planning"
              value={draft.config.adaptivePlanning === null ? 'inherit' : draft.config.adaptivePlanning ? 'on' : 'off'}
              onChange={(value) => setDraft((current) => ({
                ...current,
                config: { ...current.config, adaptivePlanning: value === 'inherit' ? null : value === 'on' },
              }))}
            >
              <option value="inherit">inherit global</option>
              <option value="on">surface-guided</option>
              <option value="off">run configured tools</option>
            </Select>
            {[
              ['surfaceMaxPages', 'initial surface pages', 1, 50],
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
                  value={draft.config[key] ?? ''}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      [key]: event.target.value
                        ? Math.max(min, Math.min(max, Number(event.target.value)))
                        : null,
                    },
                  }))}
                  placeholder="inherit global"
                  className="input-ink w-full px-3 py-2.5 font-mono text-xs"
                />
              </label>
            ))}
          </div>

          <div className="glow-divider-soft" />

          <div>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow mb-1">authenticated scan</p>
                <h3 className="font-sans text-sm font-semibold text-ink-400">headers and cookies</h3>
              </div>
              <button type="button" onClick={addHeader} className="text-[10px] font-mono uppercase tracking-wide text-ink-200 hover:text-ink-500">
                add header
              </button>
            </div>
            <div className="space-y-2">
              {headerRows.map((header, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)_auto]">
                  <input
                    value={header.name}
                    onChange={(event) => updateHeader(index, { name: event.target.value })}
                    placeholder="Authorization"
                    className="input-ink px-3 py-2.5 font-mono text-xs"
                  />
                  <input
                    value={header.value}
                    onChange={(event) => updateHeader(index, { value: event.target.value })}
                    placeholder="Bearer token"
                    className="input-ink px-3 py-2.5 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => removeHeader(index)}
                    className="rounded-sm border border-ink-500/15 px-3 py-2 font-mono text-[10px] uppercase text-ink-200 hover:border-ink-500/35 hover:text-ink-500"
                  >
                    remove
                  </button>
                </div>
              ))}
              <textarea
                value={draft.auth.cookie}
                onChange={(event) => setDraft((current) => ({ ...current, auth: { ...current.auth, cookie: event.target.value } }))}
                placeholder="session=abc; csrftoken=xyz"
                rows="3"
                className="w-full resize-none rounded-sm border border-ink-500/15 bg-paper-100/50 p-3 font-mono text-xs text-ink-500 placeholder-mist-300 focus:border-ink-500/40 focus:outline-none"
              />
            </div>
          </div>

          <div className="glow-divider-soft" />

          <div>
            <p className="eyebrow mb-3">tool overrides</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TOOL_KEYS.map((tool) => {
                const hasOverride = Object.prototype.hasOwnProperty.call(draft.config.tools, tool);
                const value = hasOverride ? (draft.config.tools[tool] ? 'on' : 'off') : 'inherit';
                return (
                  <Select key={tool} label={tool} value={value} onChange={(next) => setToolOverride(tool, next)}>
                    <option value="inherit">inherit</option>
                    <option value="on">force on</option>
                    <option value="off">force off</option>
                  </Select>
                );
              })}
            </div>
          </div>

          <div className="glow-divider-soft" />

          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block">
              <span className="eyebrow mb-2 block">webhook</span>
              <input
                value={draft.notifications.webhookUrl}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  notifications: { ...current.notifications, webhookUrl: event.target.value },
                }))}
                placeholder="https://discord.com/api/webhooks/..."
                className="input-ink w-full px-3 py-2.5 font-mono text-xs"
              />
            </label>
            <label className="flex items-center gap-3 rounded-sm border border-ink-500/15 bg-paper-50 px-3 py-2.5">
              <input
                type="checkbox"
                checked={draft.notifications.highSeverityOnly}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  notifications: { ...current.notifications, highSeverityOnly: event.target.checked },
                }))}
              />
              <span className="font-mono text-[10px] uppercase tracking-wide text-ink-200">high only</span>
            </label>
          </div>
        </div>
      )}

      {error && <p className="px-7 sm:px-8 mt-3 text-xs font-mono text-signal-bad">{error}</p>}

      <div className="px-7 sm:px-8 pt-6 pb-5 sm:pb-6 mt-3 flex flex-wrap items-center justify-end gap-3">
        <button type="button" onClick={reset} disabled={saving} className="font-sans text-sm font-semibold text-ink-200 hover:text-ink-500 px-4 py-2">
          reset
        </button>
        <button type="button" onClick={onClose} className="font-sans text-sm font-semibold text-ink-200 hover:text-ink-500 px-4 py-2">
          cancel
        </button>
        <button type="button" onClick={save} disabled={saving || loading} className="btn-ink px-7 sm:px-9 py-2.5 sm:py-3 rounded-sm uppercase">
          {saving ? 'saving...' : 'save'}
        </button>
      </div>
    </section>
  );
}
