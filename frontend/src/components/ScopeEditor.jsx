import { useEffect, useState } from 'react';
import Save from 'lucide-react/dist/esm/icons/save.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import { api } from '../lib/api';
import { useEscape } from '../hooks/useEscape';

// Lets the user edit the backend scope file: allowed / blocked glob patterns.
// Empty allowed list = everything allowed (except blocked).
export default function ScopeEditor({ onClose, embedded = false }) {
  const [scope, setScope] = useState({ allowed: [], blocked: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEscape(onClose, !embedded);

  useEffect(() => {
    api.getScope().then((s) => { setScope(s); setLoading(false); }).catch((e) => {
      setError(e.message); setLoading(false);
    });
  }, []);

  const updateList = (key, raw) => {
    setScope((p) => ({ ...p, [key]: raw.split('\n').map((s) => s.trim()).filter(Boolean) }));
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      const saved = await api.saveScope(scope);
      setScope(saved);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const panel = (
      <div
        className={`paper-card w-full ${embedded ? 'max-w-5xl mx-auto' : 'max-w-xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-7 pt-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow mb-2">scope</p>
              <h2 className="font-sans text-xl font-semibold text-ink-500">scope file</h2>
              <p className="text-xs text-ink-200 mt-2 leading-relaxed">
                Glob patterns - e.g. <code className="font-mono">*.example.com</code>.
                Empty allowed list permits any non-blocked target.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`text-mist-300 hover:text-ink-500 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-500 ${
                embedded ? 'px-2 py-1 font-mono text-[10px] uppercase tracking-wide' : 'p-1'
              }`}
              aria-label={embedded ? 'Back' : 'Close'}
            >
              {embedded ? 'back' : (
                <X aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="glow-divider mt-5 -mx-2" />
        </div>

        {loading ? (
          <p className="px-7 py-8 text-center text-ink-200 text-sm">loading...</p>
        ) : (
          <div className="px-7 pb-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <p className="eyebrow mb-2">allowed</p>
              <textarea
                value={scope.allowed.join('\n')}
                onChange={(e) => updateList('allowed', e.target.value)}
                placeholder="*.example.com&#10;subdomain.test.io"
                rows="7"
                className="w-full bg-paper-100/50 border border-ink-500/15 rounded-sm p-3 font-mono text-xs text-ink-500 placeholder-mist-300 focus:outline-none focus:border-ink-500/40 resize-none"
              />
            </div>
            <div>
              <p className="eyebrow mb-2">blocked</p>
              <textarea
                value={scope.blocked.join('\n')}
                onChange={(e) => updateList('blocked', e.target.value)}
                placeholder="admin.example.com&#10;internal.*"
                rows="7"
                className="w-full bg-paper-100/50 border border-ink-500/15 rounded-sm p-3 font-mono text-xs text-ink-500 placeholder-mist-300 focus:outline-none focus:border-ink-500/40 resize-none"
              />
            </div>
          </div>
        )}

        {error && (
          <p className="px-7 mt-3 text-xs font-mono text-ink-500">{error}</p>
        )}

        <div className="px-7 pt-6 pb-5 mt-3 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="font-sans text-sm font-semibold text-ink-200 hover:text-ink-500 transition-colors px-4 py-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-500"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn-ink inline-flex items-center gap-2 px-8 py-2.5 rounded-sm uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'saving...' : 'save'}
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
