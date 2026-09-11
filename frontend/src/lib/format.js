// Tiny shared formatters used by HistoryStrip and the homepage recent-targets row.

export function timeAgo(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDuration(ms) {
  if (!ms) return 'live';
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

export function statusTone(status) {
  if (status === 'completed') return 'border-signal-good/45 text-signal-good';
  if (status === 'running')   return 'border-ink-500/40   text-ink-500 animate-breathe';
  if (status === 'queued')    return 'border-risk-info/45 text-risk-info animate-breathe';
  if (status === 'failed')    return 'border-signal-bad/55 text-signal-bad';
  if (status === 'cancelled') return 'border-risk-medium/50 text-risk-medium';
  return 'border-ink-500/15 text-ink-200';
}
