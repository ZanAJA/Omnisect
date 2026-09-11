import { useCallback, useEffect, useMemo, useState } from 'react';
import CircleCheck from 'lucide-react/dist/esm/icons/circle-check.js';
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js';
import ScanSearch from 'lucide-react/dist/esm/icons/scan-search.js';
import Search from 'lucide-react/dist/esm/icons/search.js';
import SquareTerminal from 'lucide-react/dist/esm/icons/square-terminal.js';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js';
import TriangleAlert from 'lucide-react/dist/esm/icons/triangle-alert.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import { api } from '../lib/api';
import { formatDuration, timeAgo } from '../lib/format';

const STATUS_FILTERS = ['all', 'completed', 'running', 'queued', 'failed', 'cancelled'];

export default function ScanHistoryPage({ onOpen, onToast, onStartFirstScan }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { jobs } = await api.getHistory('', 100);
      setItems(jobs || []);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStatus = status === 'all' || item.status === status;
      const target = `${item.target || ''} ${item.startUrl || ''}`.toLowerCase();
      return matchesStatus && (!normalizedQuery || target.includes(normalizedQuery));
    });
  }, [items, query, status]);

  const totals = useMemo(() => items.reduce((summary, item) => ({
    scans: summary.scans + 1,
    completed: summary.completed + (item.status === 'completed' ? 1 : 0),
    findings: summary.findings + (item.findingsTotal || 0),
    critical: summary.critical + (item.counts?.critical || 0),
  }), { scans: 0, completed: 0, findings: 0, critical: 0 }), [items]);

  const handleDelete = async (jobId) => {
    if (!window.confirm('Permanently delete this scan from history?')) return;
    try {
      await api.deleteSnapshot(jobId);
      setItems((current) => current.filter((item) => item.jobId !== jobId));
      onToast?.({ title: 'Scan removed', message: 'The saved scan was deleted.' });
    } catch (err) {
      onToast?.({ type: 'bad', title: 'Could not delete scan', message: err.message || String(err) });
    }
  };

  return (
    <div className="history-page animate-fade-in">
      <section className="history-filter-toolbar" aria-label="History filters">
        <label className="history-search-control">
          <Search aria-hidden="true" />
          <span className="sr-only">Filter scan history by target</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by target (domain, URL, IP...)"
          />
          {query && (
            <button
              type="button"
              className="history-clear-button"
              onClick={() => setQuery('')}
              aria-label="Clear target filter"
              title="Clear filter"
            >
              <X aria-hidden="true" />
            </button>
          )}
        </label>

        <div className="history-status-filters" aria-label="Filter by scan status">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`history-filter-button ${status === filter ? 'is-active' : ''}`}
              onClick={() => setStatus(filter)}
              aria-pressed={status === filter}
            >
              {filter}
            </button>
          ))}
          <button
            type="button"
            className="history-refresh-button"
            onClick={reload}
            aria-label="Refresh scan history"
            title="Refresh scan history"
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="history-metric-grid" aria-label="Scan history summary">
        <HistoryMetric icon={ScanSearch} value={totals.scans} label="Scans" />
        <HistoryMetric icon={CircleCheck} value={totals.completed} label="Completed" />
        <HistoryMetric icon={Search} value={totals.findings} label="Findings" />
        <HistoryMetric icon={TriangleAlert} value={totals.critical} label="Critical" />
      </section>

      {error ? (
        <HistoryState
          icon={TriangleAlert}
          title="History unavailable"
          description={error}
          actionLabel="Try again"
          actionIcon={RefreshCw}
          onAction={reload}
        />
      ) : loading && items.length === 0 ? (
        <HistoryState
          icon={RefreshCw}
          iconClassName="animate-spin"
          title="Loading scan history"
          description="Looking for previous authorized scans."
        />
      ) : items.length === 0 ? (
        <HistoryState
          icon={SquareTerminal}
          title="No scan history yet"
          description="Past scans will appear here after your first authorized run."
          actionLabel="Start first scan"
          actionIcon={ScanSearch}
          onAction={onStartFirstScan}
        />
      ) : filtered.length === 0 ? (
        <HistoryState
          icon={Search}
          title="No matching scans"
          description="Adjust the target search or status filter."
        />
      ) : (
        <ul className="history-results-list" aria-label="Saved scans">
          {filtered.map((item) => (
            <ScanRow
              key={item.jobId}
              item={item}
              onOpen={onOpen}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryMetric({ icon: Icon, value, label }) {
  return (
    <article className="history-metric-card">
      <span className="history-metric-icon" aria-hidden="true"><Icon /></span>
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </article>
  );
}

function HistoryState({ icon: Icon, iconClassName = '', title, description, actionLabel, actionIcon: ActionIcon, onAction }) {
  return (
    <section className="history-state-panel" aria-live="polite">
      <span className="history-state-icon" aria-hidden="true">
        <Icon className={iconClassName} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {actionLabel && onAction && (
        <button type="button" className="history-state-action" onClick={onAction}>
          {ActionIcon && <ActionIcon aria-hidden="true" />}
          <span>{actionLabel}</span>
        </button>
      )}
    </section>
  );
}

function ScanRow({ item, onOpen, onDelete }) {
  const counts = item.counts || {};
  const severeCount = (counts.critical || 0) + (counts.high || 0);

  return (
    <li className="history-result-row">
      <div className="history-result-main">
        <div className="history-result-meta">
          <span className="history-result-status">{item.status || 'unknown'}</span>
          <span>{timeAgo(item.startedAt)}</span>
          <span>{formatDuration(item.durationMs)}</span>
        </div>
        <p className="history-result-target">{item.startUrl || item.target || 'Unknown target'}</p>
        <p className="history-result-detail">
          {item.liveHostCount || 0} hosts · {item.endpointCount || 0} endpoints · {item.errorCount || 0} warnings
        </p>
      </div>

      <div className="history-result-findings" aria-label={`${item.findingsTotal || 0} findings`}>
        <strong>{item.findingsTotal || 0}</strong>
        <span>findings</span>
        <small>{severeCount} critical / high</small>
      </div>

      <div className="history-result-actions">
        <button type="button" className="history-open-button" onClick={() => onOpen?.(item.jobId)}>
          <span>Open</span>
          <ExternalLink aria-hidden="true" />
        </button>
        <button
          type="button"
          className="history-delete-button"
          onClick={() => onDelete(item.jobId)}
          aria-label={`Delete scan for ${item.target || 'target'}`}
          title="Delete scan"
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
