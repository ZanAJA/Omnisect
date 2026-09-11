import { useState } from 'react';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left.js';
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js';
import Plus from 'lucide-react/dist/esm/icons/plus.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import AnimatedNumber from './AnimatedNumber';

const STATUS_LABEL = {
  queued: 'queued',
  running: 'scanning',
  completed: 'complete',
  cancelled: 'cancelled',
  failed: 'failed',
  pending: 'not scanned',
};

const STATUS_DOT = {
  queued:    'bg-risk-info animate-breathe',
  running:   'bg-accent animate-breathe',
  completed: 'bg-signal-good',
  cancelled: 'bg-signal-warn',
  failed:    'bg-signal-bad',
  pending:   'bg-mist-300',
};

const STATUS_GLOW = {
  queued:    'target-glow-running',
  running:   'target-glow-running',
  completed: 'target-glow-done',
  cancelled: 'target-glow-cancelled',
  failed:    'target-glow-failed',
  pending:   'target-glow-pending',
};

const STATUS_GROUP_ORDER = ['running', 'queued', 'pending', 'completed', 'cancelled', 'failed'];
const STATUS_GROUP_LABEL = {
  running: 'running',
  queued: 'queued',
  pending: 'not scanned',
  completed: 'complete',
  cancelled: 'cancelled',
  failed: 'failed',
};

function totalFindings(job) {
  if (!job?.findings) return 0;
  return Object.values(job.findings).flat().length;
}

function formatTime(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TargetPanel({
  targets, activeTarget, jobs,
  onAddTarget, onRemoveTarget, onSelectTarget,
  onStartScan, onCancelScan, onCloseDrawer,
  onCollapse,
}) {
  const [input, setInput] = useState('');

  const handleAdd = (e) => {
    e.preventDefault();
    if (input.trim()) { onAddTarget(input.trim()); setInput(''); }
  };

  const activeJob = activeTarget ? jobs[activeTarget] : null;
  const isRunning = activeJob?.status === 'running' || activeJob?.status === 'queued';
  const runningCount = Object.values(jobs).filter((job) => job?.status === 'running' || job?.status === 'queued').length;
  const totalFindingCount = Object.values(jobs).reduce((sum, job) => sum + totalFindings(job), 0);

  // Group targets by status for scannability
  const grouped = STATUS_GROUP_ORDER.reduce((acc, status) => {
    const items = targets.filter((t) => (jobs[t]?.status || 'pending') === status);
    if (items.length) acc.push({ status, items });
    return acc;
  }, []);

  return (
    <aside className="w-64 flex flex-col flex-shrink-0 relative h-full min-h-0 bg-paper-100">
      <div className="sidebar-frame flex-1 min-h-0 flex flex-col px-4 pt-5 pb-4 overflow-x-hidden overflow-y-auto">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <p className="eyebrow mb-2">target list</p>
            <h3 className="font-sans text-lg text-ink-500 font-semibold">targets</h3>
          </div>
          <div className="flex items-center gap-1.5">
            {onCollapse && (
              <button
                onClick={onCollapse}
                className="icon-button hidden lg:inline-flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            {onCloseDrawer && (
              <button
                onClick={onCloseDrawer}
                className="icon-button lg:hidden text-lg leading-none font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
                aria-label="Close targets"
              ><X className="w-4 h-4" aria-hidden="true" /></button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <PanelStat label="saved" value={targets.length} />
          <PanelStat label="running" value={runningCount} />
          <PanelStat label="findings" value={totalFindingCount} />
        </div>

        <form onSubmit={handleAdd} className="sidebar-add-form p-2 mb-5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="example.com/path"
              aria-label="Target domain or URL"
              className="input-ink flex-1 px-2 py-2 font-mono text-[13px] min-w-0"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="btn-ink flex-shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500 disabled:opacity-40"
              aria-label="Add target"
              title="Add target"
            >
              <Plus className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </form>

        <div className="-mx-2 pr-1" role="listbox" aria-label="Targets">
          {targets.length === 0 ? (
            <div className="text-center mt-10 px-4 animate-fade-in">
              <p className="eyebrow mb-2">empty</p>
              <p className="text-ink-200 text-xs">add a domain or full URL above</p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ status, items }) => (
                <div key={status}>
                  <p className="eyebrow px-3 mb-1.5 text-[9px]">
                    {STATUS_GROUP_LABEL[status]} · {items.length}
                  </p>
                  <div className="space-y-0.5">
                    {items.map((target, i) => {
                      const job = jobs[target];
                      const active = target === activeTarget;
                      const findingCount = totalFindings(job);
                      const glowClass = STATUS_GLOW[job?.status || 'pending'] || '';
                      return (
                        <div
                          key={target}
                          role="option"
                          aria-selected={active}
                          onClick={() => onSelectTarget(target)}
                          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelectTarget(target))}
                          tabIndex={0}
                          className={`target-row ${glowClass} ${active ? 'target-row-active' : ''} group w-full min-h-[52px] text-left flex items-center gap-3 px-3 py-2.5 rounded-sm cursor-pointer transition-all duration-300 relative focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500 ${
                            active ? 'bg-ink-500/10' : 'hover:bg-ink-500/5'
                          }`}
                          style={{ animation: `liftIn 0.4s ${i * 30}ms cubic-bezier(0.16, 1, 0.3, 1) backwards` }}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-300 ${
                            STATUS_DOT[job?.status || 'pending']
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-mono truncate transition-colors duration-300 ${
                              active ? 'text-ink-500' : 'text-ink-200'
                            }`}>
                              {target}
                            </p>
                            <p className="text-[10px] font-mono text-ink-100 mt-0.5">
                              {job?.status === 'running' ? (
                                <><AnimatedNumber value={job.progress} duration={400} />% / {job.phase}</>
                              ) : job?.status === 'queued' ? (
                                <>queued{job.queuePosition ? ` #${job.queuePosition}` : ''}</>
                              ) : job?.status === 'completed' ? (
                                <><AnimatedNumber value={findingCount} duration={500} /> findings</>
                              ) : (
                                STATUS_LABEL[job?.status || 'pending'] || job?.status
                              )}
                              {job?.finishedAt && (
                                <span className="text-mist-300 ml-2">{formatTime(job.finishedAt)}</span>
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onRemoveTarget(target); }}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-mist-300 hover:text-ink-500 transition-all text-base leading-none font-semibold focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-500"
                            aria-label={`Remove ${target}`}
                          ><X className="w-3.5 h-3.5" aria-hidden="true" /></button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {activeTarget && (
          <div className="mt-5 animate-fade-in">
            {isRunning ? (
              <button
                onClick={onCancelScan}
                className="btn-ink w-full py-3 rounded-sm uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
              >
                <span className="flex items-center justify-center gap-2.5">
                  <Spinner /> cancel scan
                </span>
              </button>
            ) : (
              <button
                onClick={onStartScan}
                className="btn-ink w-full py-3 rounded-sm uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
              >
                begin scan
              </button>
            )}
            <p className="eyebrow text-center mt-3">
              {activeJob?.status === 'queued' ? 'queued' : isRunning ? 'running' : 'ready'}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function PanelStat({ label, value }) {
  const positive = Number(value) > 0;
  return (
    <div className="sidebar-stat px-2.5 py-2 transition-colors">
      <p className={`font-mono text-lg font-semibold leading-none tabular-nums truncate ${
        positive ? 'text-ink-500' : 'text-ink-100'
      }`}>
        <AnimatedNumber value={Number(value) || 0} duration={400} />
      </p>
      <p className="mt-1 text-[9px] font-mono uppercase tracking-wide text-ink-100 truncate">{label}</p>
    </div>
  );
}

function Spinner() {
  return <LoaderCircle className="w-3 h-3 animate-spin" aria-hidden="true" />;
}
