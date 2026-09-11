import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Crosshair from 'lucide-react/dist/esm/icons/crosshair.js';
import FileSearch from 'lucide-react/dist/esm/icons/file-search.js';
import FilterX from 'lucide-react/dist/esm/icons/filter-x.js';
import Globe2 from 'lucide-react/dist/esm/icons/globe-2.js';
import KeyRound from 'lucide-react/dist/esm/icons/key-round.js';
import ScanSearch from 'lucide-react/dist/esm/icons/scan-search.js';
import Settings2 from 'lucide-react/dist/esm/icons/settings-2.js';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check.js';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.js';
import TriangleAlert from 'lucide-react/dist/esm/icons/triangle-alert.js';

const DEFAULT_FILTER = { search: '', severity: 'all', type: 'all', newOnly: false };
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const TYPES = ['nuclei', 'sqli', 'xss', 'idor', 'headers', 'takeover'];

function flatFindings(job) {
  return Object.values(job?.findings || {}).flat();
}

function normalize(text) {
  return String(text || '').toLowerCase();
}

export default function CommandPalette({
  open,
  anchorRef,
  query = '',
  targets,
  activeTarget,
  jobs,
  onClose,
  onQueryChange,
  onSelectTarget,
  onOpenConfig,
  onOpenTarget,
  onOpenScope,
  onOpenAuth,
  onSetFindingFilter,
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState(null);

  const items = useMemo(() => {
    const activeJob = activeTarget ? jobs[activeTarget] : null;
    const actions = [
      {
        group: 'actions',
        title: 'Open configuration',
        subtitle: 'scan engines, threads, aggressive mode',
        keywords: 'settings configure config tools engines',
        icon: Settings2,
        run: onOpenConfig,
      },
      {
        group: 'actions',
        title: 'Open target settings',
        subtitle: activeTarget ? 'headers, cookies, webhook, target overrides' : 'select a target first',
        keywords: 'target settings headers cookies webhook auth',
        icon: Crosshair,
        run: onOpenTarget,
      },
      {
        group: 'actions',
        title: 'Open scope',
        subtitle: 'allowed and blocked domain patterns',
        keywords: 'scope allow block domain',
        icon: ShieldCheck,
        run: onOpenScope,
      },
      {
        group: 'actions',
        title: 'Open auth',
        subtitle: 'API key prompt',
        keywords: 'auth key api login',
        icon: KeyRound,
        run: onOpenAuth,
      },
      {
        group: 'findings',
        title: 'Clear finding filters',
        subtitle: 'show every finding again',
        keywords: 'filter clear all findings',
        icon: FilterX,
        run: () => onSetFindingFilter(DEFAULT_FILTER),
      },
      {
        group: 'findings',
        title: 'Show new findings',
        subtitle: 'new since last scan',
        keywords: 'filter new findings diff',
        icon: Sparkles,
        run: () => onSetFindingFilter({ newOnly: true }),
      },
      ...SEVERITIES.map((severity) => ({
        group: 'findings',
        title: `Show ${severity} findings`,
        subtitle: 'severity filter',
        keywords: `filter severity ${severity}`,
        icon: TriangleAlert,
        run: () => onSetFindingFilter({ severity }),
      })),
      ...TYPES.map((type) => ({
        group: 'findings',
        title: `Show ${type} findings`,
        subtitle: 'type filter',
        keywords: `filter type ${type}`,
        icon: ScanSearch,
        run: () => onSetFindingFilter({ type }),
      })),
    ];

    const targetItems = targets.map((target) => {
      const job = jobs[target];
      return {
        group: 'targets',
        title: target,
        subtitle: job ? `${job.status} / ${job.phase || 'ready'}` : 'ready',
        keywords: `target ${target}`,
        icon: Globe2,
        run: () => onSelectTarget(target),
      };
    });

    const findingItems = flatFindings(activeJob).slice(0, 40).map((finding) => ({
      group: 'matching findings',
      title: finding.name || finding.description || finding.url || 'finding',
      subtitle: finding.url || finding.template || finding.type,
      keywords: `${finding.type} ${finding.severity} ${finding.template || ''} ${finding.payload || ''}`,
      icon: FileSearch,
      run: () => onSetFindingFilter({
        search: finding.url || finding.name || finding.description || '',
      }),
    }));

    return [...actions, ...targetItems, ...findingItems];
  }, [activeTarget, jobs, onOpenAuth, onOpenConfig, onOpenScope, onOpenTarget, onSelectTarget, onSetFindingFilter, targets]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return items.slice(0, 60);
    return items
      .filter((item) => normalize(`${item.title} ${item.subtitle} ${item.keywords}`).includes(q))
      .slice(0, 60);
  }, [items, query]);

  const runItem = useCallback((item) => {
    item.run();
    onQueryChange?.('');
    onClose();
  }, [onClose, onQueryChange]);

  useEffect(() => {
    setActiveIndex(0);
  }, [open, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!filtered.length) return;
        setActiveIndex((current) => Math.min(current + 1, filtered.length - 1));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!filtered.length) return;
        setActiveIndex((current) => Math.max(current - 1, 0));
      }
      if (event.key === 'Enter' && filtered[activeIndex]) {
        event.preventDefault();
        runItem(filtered[activeIndex]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, filtered, onClose, open, runItem]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const rect = anchorRef?.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportPadding = 16;
      const width = Math.min(432, window.innerWidth - (viewportPadding * 2));
      const left = Math.min(
        Math.max(viewportPadding, rect.right - width),
        window.innerWidth - width - viewportPadding,
      );
      setPosition({ left, top: rect.bottom + 8, width });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [anchorRef, open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[18]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            id="command-search-results"
            className="search-dropdown-panel fixed z-[70] overflow-hidden"
            style={{
              left: position?.left,
              top: position?.top,
              width: position?.width,
              visibility: position ? 'visible' : 'hidden',
            }}
            role="dialog"
            aria-modal="false"
            aria-label="Search results"
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: -8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.985 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="search-dropdown-heading">
              <span>
                {query ? `Matches for "${query}"` : 'Suggested actions'}
              </span>
              <span>{filtered.length}</span>
            </div>

            <motion.div
              className="search-dropdown-list"
              role="listbox"
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.025 } },
              }}
            >
              {filtered.length ? filtered.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.button
                    id={`command-result-${index}`}
                    key={`${item.group}-${item.title}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    onClick={() => runItem(item)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`search-result-row ${activeIndex === index ? 'is-active' : ''}`}
                    variants={{
                      hidden: { opacity: 0, y: 8 },
                      show: { opacity: 1, y: 0 },
                    }}
                    transition={{ duration: 0.16 }}
                    layout
                  >
                    <span className="search-result-icon" aria-hidden="true">
                      <Icon strokeWidth={1.8} />
                    </span>
                    <span className="search-result-copy">
                      <span className="search-result-title">{item.title}</span>
                      <span className="search-result-subtitle">{item.subtitle}</span>
                    </span>
                    <span className="search-result-group">{item.group}</span>
                  </motion.button>
                );
              }) : (
                <motion.div
                  className="px-4 py-9 text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <p className="eyebrow mb-2">no matches</p>
                  <p className="text-sm text-ink-200">Try a target, severity, or command.</p>
                </motion.div>
              )}
            </motion.div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
