import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { timeAgo, formatDuration, statusTone } from '../lib/format';

// Compact row showing the most recent persisted scans for the active target.
// Click a chip → caller loads that snapshot into the dashboard.
// Trash icon on hover → permanently remove that scan from history.

export default function HistoryStrip({ target, currentJobId, onView, refreshKey = 0 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!target) { setItems([]); return; }
    setLoading(true);
    setError('');
    try {
      const { jobs } = await api.getHistory(target, 8);
      setItems(jobs || []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  const handleDelete = async (jobId, e) => {
    e.stopPropagation();
    if (!window.confirm('Permanently delete this scan from history?')) return;
    try {
      await api.deleteSnapshot(jobId);
      setItems((prev) => prev.filter((j) => j.jobId !== jobId));
    } catch (err) {
      alert(err.message || String(err));
    }
  };

  if (!target) return null;
  if (loading && items.length === 0) {
    return <div className="text-[10px] font-mono text-ink-200 px-1">loading history…</div>;
  }
  if (error) {
    return <div className="text-[10px] font-mono text-signal-bad px-1">history: {error}</div>;
  }
  if (items.length === 0) {
    return (
      <div className="text-[10px] font-mono uppercase tracking-wide text-ink-200 px-1">
        no past scans for this target
      </div>
    );
  }

  return (
    <section aria-label="Scan history" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <p className="eyebrow">history · last {items.length}</p>
        <button
          type="button"
          onClick={reload}
          className="text-[10px] font-mono uppercase tracking-wide text-ink-200 hover:text-ink-500 transition-colors"
          aria-label="Refresh history"
        >
          refresh
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 history-strip">
        {items.map((j) => {
          const active = j.jobId === currentJobId;
          const hasCritOrHigh = j.counts.critical + j.counts.high > 0;
          return (
            <button
              key={j.jobId}
              type="button"
              onClick={() => onView?.(j.jobId)}
              className={`history-chip group flex-shrink-0 text-left px-3 py-2 rounded-sm border bg-paper-50/85 transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500 ${statusTone(j.status)} ${active ? 'history-chip-active' : ''}`}
              title={`${j.status} · ${j.findingsTotal} findings · ${timeAgo(j.startedAt)}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wide">{j.status}</span>
                <span className="font-mono text-[10px] text-ink-100">{timeAgo(j.startedAt)}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`font-mono text-base font-semibold ${hasCritOrHigh ? 'text-risk-high' : 'text-ink-500'}`}>
                  {j.findingsTotal}
                </span>
                <span className="font-mono text-[10px] text-ink-200">findings</span>
                {j.newCount > 0 && (
                  <span className="font-mono text-[9px] text-risk-info">new·{j.newCount}</span>
                )}
                <button
                  type="button"
                  onClick={(e) => handleDelete(j.jobId, e)}
                  className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100 focus:opacity-80 text-ink-200 hover:text-signal-bad text-xs leading-none transition-opacity"
                  aria-label="Delete this scan from history"
                  title="Delete from history"
                >
                  ×
                </button>
              </div>
              {j.counts.critical + j.counts.high > 0 && (
                <div className="mt-1 flex gap-1.5">
                  {j.counts.critical > 0 && (
                    <span className="text-[9px] font-mono text-risk-critical">crit·{j.counts.critical}</span>
                  )}
                  {j.counts.high > 0 && (
                    <span className="text-[9px] font-mono text-risk-high">high·{j.counts.high}</span>
                  )}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[9px] text-ink-100">
                <span>{formatDuration(j.durationMs)}</span>
                <span>hosts·{j.liveHostCount || 0}</span>
                <span>urls·{j.endpointCount || 0}</span>
                {j.errorCount > 0 && <span className="text-risk-medium">warn·{j.errorCount}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
