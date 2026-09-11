import { useEffect, useState } from 'react';
import { api } from '../lib/api';

// Small badge in the header that shows tool readiness. Click to expand list.
export default function ToolStatus() {
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    api.toolStatus().then(setData).catch(() => setData(null));
  }, []);

  if (!data) return null;

  const { tools, missing, allOk } = data;
  const label = allOk ? 'tools ready' : `${missing.length} unavailable`;

  const refresh = async () => {
    setRefreshing(true);
    try {
      setData(await api.toolStatus(true));
    } catch {
      setData(null);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="shell-chip font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
        aria-expanded={expanded}
        aria-label="Tool availability"
      >
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            allOk ? 'bg-signal-good animate-breathe' : 'bg-risk-medium'
          }`}
        />
        <span>{label}</span>
      </button>

      {expanded && (
        <div
          className="absolute top-full right-0 mt-2 paper-card p-4 w-[min(18rem,calc(100vw-2rem))] z-30 animate-fade-in"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="eyebrow">tools</p>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="text-[10px] font-mono text-ink-100 hover:text-ink-500 disabled:text-mist-300 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-500"
            >
              {refreshing ? 'checking' : 'refresh'}
            </button>
          </div>
          <div className="space-y-1.5">
            {Object.entries(tools).map(([name, ok]) => (
              <div key={name} className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-ink-300">{name}</span>
                <span className={`text-[10px] font-mono ${
                  ok ? 'text-ink-500' : 'text-mist-300'
                }`}>
                  {ok ? 'ok' : ok === null ? 'checking' : 'unavailable'}
                </span>
              </div>
            ))}
          </div>
          {!allOk && (
            <p className="text-[11px] text-ink-100 mt-3 leading-relaxed">
              Unavailable external-tool phases are skipped; curl-based checks can still run.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
