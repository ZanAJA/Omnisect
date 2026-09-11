import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left.js';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js';
import FileCheck2 from 'lucide-react/dist/esm/icons/file-check-2.js';
import GitCompareArrows from 'lucide-react/dist/esm/icons/git-compare-arrows.js';
import Moon from 'lucide-react/dist/esm/icons/moon.js';
import Network from 'lucide-react/dist/esm/icons/network.js';
import Play from 'lucide-react/dist/esm/icons/play.js';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check.js';
import Square from 'lucide-react/dist/esm/icons/square.js';
import Sun from 'lucide-react/dist/esm/icons/sun.js';
import GlowDivider from './components/GlowDivider';
import ApiKeyPrompt from './components/ApiKeyPrompt';
import ToastStack from './components/ToastStack';
import MotionToggle from './components/MotionToggle';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useScanEvents } from './hooks/useScanEvents';
import { api } from './lib/api';
import { storage } from './lib/storage';

const TargetPanel = lazy(() => import('./components/TargetPanel'));
const ScanProgress = lazy(() => import('./components/ScanProgress'));
const FindingsPanel = lazy(() => import('./components/FindingsPanel'));
const ReportPanel = lazy(() => import('./components/ReportPanel'));
const ScanConfig = lazy(() => import('./components/ScanConfig'));
const HistoryStrip = lazy(() => import('./components/HistoryStrip'));
const ScopeEditor = lazy(() => import('./components/ScopeEditor'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const ScanSummaryPanel = lazy(() => import('./components/ScanSummaryPanel'));
const ScanDiffPanel = lazy(() => import('./components/ScanDiffPanel'));
const TargetSettings = lazy(() => import('./components/TargetSettings'));
const ScanHistoryPage = lazy(() => import('./components/ScanHistoryPage'));
const AnimatedNavigationTabs = lazy(() => import('./components/ui/AnimatedNavigationTabs'));
const ActionSearchBar = lazy(() => import('./components/ui/ActionSearchBar'));


const HOME_FEATURES = [
  {
    title: 'Discover',
    body: 'Enumerate subdomains, resolve records, probe live hosts, collect TLS signals, and crawl useful endpoints from one target.',
    signal: 'Asset graph',
    detail: 'Hosts, ports, URLs',
    icon: Network,
  },
  {
    title: 'Prioritize',
    body: 'Group findings by severity, mark what is new, and keep evidence close enough to copy straight into verification tools.',
    signal: 'Risk queue',
    detail: 'Critical to info',
    icon: ShieldCheck,
  },
  {
    title: 'Compare',
    body: 'Review past runs, track changes between scans, and keep the attack surface from becoming a mystery between sessions.',
    signal: 'Run diff',
    detail: 'New, fixed, changed',
    icon: GitCompareArrows,
  },
  {
    title: 'Report',
    body: 'Turn verified findings into portable evidence without rebuilding the context after every scan.',
    signal: 'Evidence pack',
    detail: 'MD, JSON, SARIF',
    icon: FileCheck2,
  },
];

const HOME_WORKFLOW = [
  ['01', 'Set a scoped domain or URL'],
  ['02', 'Run the recon pipeline'],
  ['03', 'Review findings and changed assets'],
  ['04', 'Export evidence for reporting'],
];

const DEFAULT_CONFIG = {
  threads: 50,
  aggressive: false,
  adaptivePlanning: true,
  surfaceMaxPages: 20,
  surfaceSecondaryHosts: 3,
  smartMaxEndpoints: 250,
  smartMaxRequests: 1500,
  tools: {
    surfaceMapper: true,
    subfinder: true, sublist3r: true, ctlog: true, dnsx: true, naabu: true, nmap: true, httpx: true, headers: true,
    takeover: true, tlsx: true, gau: true, wayback: true, urlscan: true, robots: true, ffuf: true, katana: true, nuclei: true,
    sqli: true, xss: true, idor: true,
  },
};

const DEFAULT_FINDING_FILTER = { search: '', severity: 'all', type: 'all', newOnly: false };

const PRIMARY_NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'History' },
  { id: 'scope', label: 'Scope' },
  { id: 'config', label: 'Configure', shortLabel: 'Config' },
  { id: 'target', label: 'Target' },
  { id: 'auth', label: 'Auth' },
];

function normalizeConfig(value) {
  if (!value) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...value,
    tools: {
      ...DEFAULT_CONFIG.tools,
      ...(value.tools || {}),
    },
  };
}

function normalizeTargetInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const hasScheme = /^https?:\/\//i.test(raw);
  const hasUrlParts = raw.includes('/') || raw.includes('?') || raw.includes('#');

  if (hasScheme || hasUrlParts) {
    try {
      const url = new URL(hasScheme ? raw : `https://${raw}`);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      url.username = '';
      url.password = '';
      url.hash = '';
      url.hostname = url.hostname.toLowerCase();
      const domain = url.hostname;
      const startUrl = url.toString();
      const key = url.pathname === '/' && !url.search ? url.origin : startUrl;
      return { key, domain, startUrl };
    } catch {
      return null;
    }
  }

  const domain = raw.replace(/\/.*$/, '').toLowerCase();
  return domain ? { key: domain, domain, startUrl: null } : null;
}

export default function App() {
  // Persisted UI state
  const persisted = storage.loadState();
  const persistedConfig = storage.loadConfig();

  const [targets, setTargets] = useState(persisted.targets || []);
  const [activeTarget, setActiveTarget] = useState(persisted.activeTarget || null);
  // jobs[target] holds the live snapshot AND jobIds[target] persists the id
  const [jobIds, setJobIds] = useState(persisted.jobIds || {});
  const [jobs, setJobs] = useState({});
  const [config, setConfig] = useState(normalizeConfig(persistedConfig));

  // Utility pages
  const [utilityPage, setUtilityPage] = useState(null);
  const [showPalette, setShowPalette] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('omnisect:theme') || 'dark'; } catch { return 'dark'; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  // Desktop sidebar collapse - persisted so user preference survives reloads.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('omnisect:sidebarCollapsed') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('omnisect:sidebarCollapsed', sidebarCollapsed ? '1' : '0'); } catch {}
  }, [sidebarCollapsed]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('omnisect:theme', theme); } catch {}
  }, [theme]);

  // Track whether we're on a desktop-sized viewport so the edge tab knows which
  // state to flip when the user reopens the sidebar.
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const sidebarVisible = isDesktop ? !sidebarCollapsed : sidebarOpen;
  const openSidebar = () => {
    if (isDesktop) setSidebarCollapsed(false);
    else setSidebarOpen(true);
  };
  const openUtilityPage = useCallback((page) => {
    setUtilityPage(page);
    setSidebarOpen(false);
  }, []);
  const closeUtilityPage = useCallback(() => {
    setUtilityPage(null);
  }, []);
  const navigatePrimary = useCallback((page) => {
    if (page === 'overview') {
      setActiveTarget(null);
      setUtilityPage(null);
      return;
    }
    openUtilityPage(page);
  }, [openUtilityPage]);

  // Status
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState([]);
  const [findingFilter, setFindingFilter] = useState(DEFAULT_FINDING_FILTER);

  const searchInputRef = useRef(null);
  const [reducedMotion, setReducedMotion] = useReducedMotion();
  const searchAnchorRef = useRef(null);
  const themeTransitionTimerRef = useRef(null);

  const toggleTheme = useCallback(() => {
    document.documentElement.classList.add('theme-transitioning');
    if (themeTransitionTimerRef.current) clearTimeout(themeTransitionTimerRef.current);
    setTheme((current) => current === 'dark' ? 'light' : 'dark');
    themeTransitionTimerRef.current = window.setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
      themeTransitionTimerRef.current = null;
    }, 900);
  }, []);

  useEffect(() => () => {
    if (themeTransitionTimerRef.current) clearTimeout(themeTransitionTimerRef.current);
    document.documentElement.classList.remove('theme-transitioning');
  }, []);

  const addToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => {
      // Drop any existing toast with the same title so identical messages
      // (e.g. repeated "reconnecting scan stream") don't pile up.
      const filtered = toast.title
        ? prev.filter((t) => t.title !== toast.title)
        : prev;
      return [...filtered.slice(-3), { id, type: 'info', ...toast }];
    });
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Persistence
  useEffect(() => { storage.saveState({ targets, activeTarget, jobIds }); }, [targets, activeTarget, jobIds]);
  useEffect(() => { storage.saveConfig(config); }, [config]);

  // Backend health + auth events
  useEffect(() => {
    const onAuth = () => {
      openUtilityPage('auth');
      addToast({ type: 'warn', title: 'auth required', message: 'Paste the backend API key to continue.' });
    };
    window.addEventListener('omnisect:auth-required', onAuth);
    return () => window.removeEventListener('omnisect:auth-required', onAuth);
  }, [addToast, openUtilityPage]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowPalette(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Restore any in-flight job snapshots on mount
  useEffect(() => {
    Object.entries(jobIds).forEach(([target, jobId]) => {
      api.getStatus(jobId).then((snap) => {
        if (snap) setJobs((p) => ({ ...p, [target]: snap }));
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SSE: subscribe to the currently active target's job
  const activeJobId = activeTarget ? jobIds[activeTarget] : null;
  useScanEvents(activeJobId, {
    onUpdate: (snap) => {
      if (!snap || !activeTarget) return;
      setJobs((p) => ({ ...p, [activeTarget]: { ...p[activeTarget], ...snap } }));
    },
    onPhase: (data) => {
      if (!data || !activeTarget) return;
      setJobs((p) => {
        const j = p[activeTarget];
        if (!j) return p;
        return { ...p, [activeTarget]: { ...j, phases: { ...j.phases, [data.phase]: data.state } } };
      });
    },
    onFinding: (finding) => {
      if (!finding || !activeTarget) return;
      const sev = finding.severity || 'info';
      if (sev === 'critical' || sev === 'high') {
        addToast({
          type: sev === 'critical' ? 'bad' : 'warn',
          title: `${sev} finding`,
          message: finding.name || finding.url || 'A high-impact issue was found.',
        });
      }
      setJobs((p) => {
        const j = p[activeTarget];
        if (!j) return p;
        const findings = { ...j.findings, [sev]: [...(j.findings?.[sev] || []), finding] };
        return { ...p, [activeTarget]: { ...j, findings } };
      });
    },
    onComplete: (snap) => {
      if (!snap || !activeTarget) return;
      setJobs((p) => ({ ...p, [activeTarget]: { ...p[activeTarget], ...snap } }));
      addToast({ type: 'good', title: 'scan complete', message: snap.target || activeTarget });
    },
    onScanError: (data) => {
      const message = data?.message || 'Scan stream reported an error.';
      addToast({ type: 'bad', title: 'scan warning', message });
    },
    onReconnect: ({ delay }) => {
      addToast({ type: 'warn', title: 'reconnecting scan stream', message: `retrying in ${Math.round(delay / 1000)}s`, timeout: 2600 });
    },
  });

  // Actions
  const liveJob = activeTarget ? jobs[activeTarget] : null;
  // When the user clicks a chip in HistoryStrip we display that historical
  // snapshot instead of the live job. `viewingSnapshot` is the loaded job
  // object; null means "show live".
  const [viewingSnapshot, setViewingSnapshot] = useState(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  // The job rendered in the dashboard - historical snapshot wins if set.
  const activeJob = viewingSnapshot || liveJob;
  const activeTargetInfo = activeTarget ? normalizeTargetInput(activeTarget) : null;
  // Background particles gather into the loader whenever any scan is running.
  // Clear the snapshot view whenever the user switches targets.
  useEffect(() => { setViewingSnapshot(null); }, [activeTarget]);

  // Bump history after a scan finishes so the strip pulls in the new entry.
  useEffect(() => {
    if (liveJob && (liveJob.status === 'completed' || liveJob.status === 'failed' || liveJob.status === 'cancelled')) {
      setHistoryRefreshKey((k) => k + 1);
    }
  }, [liveJob?.status]);

  const viewSnapshot = useCallback(async (jobId) => {
    if (liveJob?.jobId === jobId) {
      // Same as the live job - just clear the override and show live.
      setViewingSnapshot(null);
      return;
    }
    try {
      const snap = await api.getSnapshot(jobId);
      if (snap) setViewingSnapshot(snap);
    } catch (err) {
      addToast({ type: 'bad', title: 'could not load scan', message: err.message || String(err) });
    }
  }, [liveJob?.jobId, addToast]);

  // Open a historical scan from the cross-target History page: switch the
  // dashboard to the right target, load the snapshot, and close the utility.
  // Also adds the target to the saved list if it's not already there so the
  // user can launch follow-up scans from it.
  const openSnapshotFromHistory = useCallback(async (jobId, target) => {
    if (!jobId || !target) return;
    try {
      const snap = await api.getSnapshot(jobId);
      if (!snap) {
        addToast({ type: 'bad', title: 'snapshot not found', message: 'this scan may have been deleted' });
        return;
      }
      setTargets((prev) => (prev.includes(target) ? prev : [...prev, target]));
      setActiveTarget(target);
      setViewingSnapshot(snap);
      setUtilityPage(null);
      setSidebarOpen(false);
    } catch (err) {
      addToast({ type: 'bad', title: 'could not load scan', message: err.message || String(err) });
    }
  }, [addToast]);

  const addTarget = useCallback((value) => {
    const parsed = normalizeTargetInput(value);
    if (!parsed) return;
    setTargets((prev) => (prev.includes(parsed.key) ? prev : [...prev, parsed.key]));
    setActiveTarget(parsed.key);
    setUtilityPage(null);
    setSidebarOpen(false);
  }, []);

  const removeTarget = useCallback((domain) => {
    setTargets((prev) => prev.filter((t) => t !== domain));
    setActiveTarget((prev) => (prev === domain ? null : prev));
    setJobs((prev) => { const n = { ...prev }; delete n[domain]; return n; });
    setJobIds((prev) => { const n = { ...prev }; delete n[domain]; return n; });
  }, []);

  const startScan = useCallback(async () => {
    if (!activeTarget) return;
    const parsed = normalizeTargetInput(activeTarget);
    if (!parsed) {
      setError('target must be a domain or http/https URL');
      addToast({ type: 'bad', title: 'invalid target', message: 'Use a domain or an http/https URL.' });
      return;
    }
    setError('');
    try {
      const data = await api.startScan(parsed.domain, config, parsed.startUrl);
      setJobIds((p) => ({ ...p, [activeTarget]: data.jobId }));
      setJobs((p) => ({
        ...p,
        [activeTarget]: {
          jobId: data.jobId,
          target: activeTarget,
          startUrl: data.startUrl || parsed.startUrl,
          status: data.status || 'running',
          progress: data.progress || 0,
          phase: data.phase || (data.status === 'queued' ? 'queued' : 'initializing'),
          queuePosition: data.queuePosition || null,
          queuedAt: data.queuedAt || null,
          phases: data.phases || {},
          findings: data.findings || { critical: [], high: [], medium: [], low: [], info: [] },
          subdomains: data.subdomains || [],
          openPorts: data.openPorts || [],
          liveHosts: data.liveHosts || [],
          tls: data.tls || [],
          endpoints: data.endpoints || [],
          attackSurface: data.attackSurface || null,
          attackGraph: data.attackGraph || null,
          endpointPlan: data.endpointPlan || null,
          planningHistory: data.planningHistory || [],
          toolPlan: data.toolPlan || null,
          coverage: data.coverage || null,
          errors: data.errors || [],
          startedAt: data.startedAt || (data.status === 'queued' ? null : new Date().toISOString()),
        },
      }));
      if (data.status === 'queued') {
        addToast({ type: 'warn', title: 'scan queued', message: data.queuePosition ? `position ${data.queuePosition}` : 'waiting for an open slot' });
      }
    } catch (err) {
      setError(err.message || String(err));
      addToast({ type: 'bad', title: 'scan could not start', message: err.message || String(err) });
    }
  }, [activeTarget, addToast, config]);

  const cancelScan = useCallback(async () => {
    // Always cancel the LIVE job - never an historical snapshot we're just viewing.
    if (!liveJob?.jobId) return;
    try {
      await api.cancelScan(liveJob.jobId);
      setJobs((p) => ({ ...p, [activeTarget]: { ...p[activeTarget], status: 'cancelled' } }));
    } catch (err) {
      setError(err.message);
      addToast({ type: 'bad', title: 'cancel failed', message: err.message });
    }
  }, [liveJob, activeTarget, addToast]);

  const updateFindingTriage = useCallback(async (finding, patch) => {
    const jobId = activeJob?.jobId;
    const findingId = finding?.id || finding?.fingerprint;
    if (!jobId || !findingId) return;
    try {
      const data = await api.updateFinding(jobId, findingId, patch);
      if (data?.job) {
        if (viewingSnapshot?.jobId === jobId) setViewingSnapshot(data.job);
        if (activeTarget && liveJob?.jobId === jobId) {
          setJobs((p) => ({ ...p, [activeTarget]: data.job }));
        }
      }
      addToast({ type: 'good', title: 'finding updated', message: finding.name || finding.type || 'triage saved', timeout: 1800 });
    } catch (err) {
      addToast({ type: 'bad', title: 'update failed', message: err.message || String(err) });
    }
  }, [activeJob?.jobId, activeTarget, addToast, liveJob?.jobId, viewingSnapshot?.jobId]);

  // Render
  return (
    <Suspense fallback={<div className="h-screen bg-paper-100" aria-busy="true" />}>
    <div className="h-screen flex flex-col relative bg-paper-100 overflow-hidden">
      {/* Header */}
      <header className="cosmic-chrome app-header relative px-4 sm:px-7 lg:px-9 py-3 flex-shrink-0 border-b border-ink-500/10 z-20 overflow-x-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center min-w-0 animate-fade-in">
            <button
              type="button"
              onClick={() => { setActiveTarget(null); setUtilityPage(null); }}
              className="wordmark-btn min-w-0 text-left rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500 group"
              aria-label="Go to homepage"
              title="Go to homepage"
            >
              <div className="min-w-0">
                <h1 className="font-display text-xl sm:text-2xl text-ink-500 leading-tight truncate font-bold tracking-normal transition-colors group-hover:text-ink-600">
                  Omnisect
                </h1>
              </div>
            </button>
          </div>

          <nav className="flex flex-1 items-center justify-end gap-3 min-w-0" aria-label="Primary">
            <AnimatedNavigationTabs
              id="primary-navigation"
              items={PRIMARY_NAV_ITEMS}
              activeId={utilityPage || 'overview'}
              onChange={navigatePrimary}
              className="hidden lg:block"
            />
            <ActionSearchBar
              anchorRef={searchAnchorRef}
              inputRef={searchInputRef}
              value={searchQuery}
              open={showPalette}
              onChange={(value) => {
                setSearchQuery(value);
                setShowPalette(true);
              }}
              onFocus={() => setShowPalette(true)}
              onEscape={() => setShowPalette(false)}
            />

            <MotionToggle reduced={reducedMotion} onToggle={setReducedMotion} />
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              role="switch"
              aria-checked={theme === 'light'}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark'
                ? <Sun aria-hidden="true" strokeWidth={1.8} />
                : <Moon aria-hidden="true" strokeWidth={1.8} />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
          </nav>
        </div>

      </header>

      {/* Edge-of-screen open button - only visible when the sidebar is hidden. */}
      {!sidebarVisible && (
        <button
          type="button"
          onClick={openSidebar}
          className="sidebar-edge-tab"
          aria-label="Open targets sidebar"
          title="Open targets"
        >
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative z-10">
        {/* Sidebar: drawer on mobile (overlay), collapsible side panel on desktop */}
        <div
          className={`fixed lg:static lg:self-stretch lg:min-h-0 inset-y-0 left-0 z-40 transition-all duration-300 ${
            // Mobile drawer translate
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } ${
            // Desktop: when collapsed, hide via translate AND zero out the layout width.
            sidebarCollapsed ? 'lg:-translate-x-full lg:w-0 lg:overflow-hidden' : 'lg:translate-x-0 lg:w-auto'
          }`}
        >
          <div className="bg-paper-100 lg:bg-transparent h-full min-h-0 shadow-xl lg:shadow-none">
            <TargetPanel
              targets={targets}
              activeTarget={activeTarget}
              jobs={jobs}
              onAddTarget={addTarget}
              onRemoveTarget={removeTarget}
              onSelectTarget={(t) => { setActiveTarget(t); setUtilityPage(null); setSidebarOpen(false); }}
              onStartScan={startScan}
              onCancelScan={cancelScan}
              onCloseDrawer={() => setSidebarOpen(false)}
              onCollapse={() => setSidebarCollapsed(true)}
            />
          </div>
        </div>

        {/* Drawer scrim on mobile */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-paper-100/85 backdrop-blur-sm z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="app-main-scroll flex-1 min-h-0 overflow-y-auto relative">
          <div className={`relative min-h-full ${!activeTarget && !utilityPage ? 'p-0' : 'px-4 sm:px-7 lg:px-10 py-5 sm:py-7 pb-6 lg:pb-10'}`}>
            {error && (
              <div className="max-w-5xl mx-auto mb-6 bg-paper-50 border border-ink-500/20 border-l-[3px] border-l-risk-critical px-4 py-3 text-xs font-mono text-ink-300 rounded-sm relative">
                <span className="eyebrow mr-2 text-risk-critical">error</span>
                {error}
              </div>
            )}

            {utilityPage ? (
              <UtilityPage
                page={utilityPage}
                config={config}
                activeTarget={activeTargetInfo?.domain || activeTarget}
                onSaveConfig={setConfig}
                onClose={closeUtilityPage}
                onOpenSnapshot={openSnapshotFromHistory}
                onToast={addToast}
              />
            ) : !activeTarget ? (
              <EmptyState
                onAddTarget={addTarget}
                onNavigate={navigatePrimary}
              />
            ) : (
              <div className="space-y-5 max-w-6xl mx-auto animate-fade-in relative" key={activeTarget}>
                <TargetHeader job={activeJob} target={activeTarget}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <ScanLauncher
                      liveJob={liveJob}
                      onStart={startScan}
                      onCancel={cancelScan}
                      disabled={!!viewingSnapshot}
                    />
                    {activeJob?.status === 'completed' && (
                      <ReportPanel jobId={activeJob.jobId} />
                    )}
                  </div>
                </TargetHeader>

                {viewingSnapshot && (
                  <div className="flex items-center justify-between gap-3 bg-paper-50 border border-ink-500/25 border-l-[3px] border-l-ink-400 px-4 py-2.5 rounded-sm">
                    <p className="text-[11px] font-mono text-ink-200">
                      <span className="eyebrow mr-2 text-ink-300">viewing historical scan</span>
                      from {new Date(viewingSnapshot.startedAt).toLocaleString()}
                    </p>
                    <button
                      type="button"
                      onClick={() => setViewingSnapshot(null)}
                      className="text-[11px] font-mono uppercase tracking-wide text-ink-200 hover:text-ink-500 transition-colors"
                    >
                      back to live
                    </button>
                  </div>
                )}

                {activeJob ? (
                  <>
                    <div style={{ animationDelay: '40ms' }} className="animate-lift-in">
                      <ScanSummaryPanel job={activeJob} config={config} />
                    </div>
                    <div style={{ animationDelay: '120ms' }} className="animate-lift-in">
                      <ScanProgress job={activeJob} onCancel={cancelScan} />
                    </div>
                    <div style={{ animationDelay: '200ms' }} className="animate-lift-in">
                      <FindingsPanel
                        findings={activeJob.findings}
                        filter={findingFilter}
                        onFilterChange={setFindingFilter}
                        onTriageChange={updateFindingTriage}
                        onCopy={(label) => addToast({ type: 'good', title: 'copied', message: label, timeout: 1800 })}
                      />
                    </div>
                    <div style={{ animationDelay: '280ms' }} className="animate-lift-in">
                      <ScanDiffPanel target={activeTarget} job={activeJob} />
                    </div>
                    <div style={{ animationDelay: '360ms' }} className="animate-lift-in">
                      <HistoryStrip
                        target={activeTarget}
                        currentJobId={activeJob?.jobId}
                        onView={viewSnapshot}
                        refreshKey={historyRefreshKey}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <NoScanState
                      target={activeTarget}
                      config={config}
                      onStart={startScan}
                      onOpenConfig={() => openUtilityPage('config')}
                    />
                    <HistoryStrip
                      target={activeTarget}
                      currentJobId={activeJob?.jobId}
                      onView={viewSnapshot}
                      refreshKey={historyRefreshKey}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      <CommandPalette
        open={showPalette}
        anchorRef={searchAnchorRef}
        query={searchQuery}
        targets={targets}
        activeTarget={activeTarget}
        jobs={jobs}
        onClose={() => setShowPalette(false)}
        onQueryChange={setSearchQuery}
        onSelectTarget={(target) => { setActiveTarget(target); setUtilityPage(null); setSidebarOpen(false); }}
        onOpenConfig={() => openUtilityPage('config')}
        onOpenTarget={() => openUtilityPage('target')}
        onOpenScope={() => openUtilityPage('scope')}
        onOpenAuth={() => openUtilityPage('auth')}
        onSetFindingFilter={(patch) => setFindingFilter((current) => ({ ...current, ...patch }))}
      />
            <MobilePrimaryNav
        items={PRIMARY_NAV_ITEMS}
        activeId={utilityPage || 'overview'}
        onChange={navigatePrimary}
      />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
    </Suspense>
  );
}

function MobilePrimaryNav({ items, activeId, onChange }) {
  return (
    <nav className="mobile-primary-nav lg:hidden" aria-label="Primary pages">
      <ul className="mobile-primary-nav-list">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <li key={item.id} className="mobile-primary-nav-item">
              <button
                type="button"
                className={`mobile-primary-nav-tab${isActive ? ' is-active' : ''}`}
                onClick={() => onChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span>{item.shortLabel || item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function UtilityPage({ page, config, activeTarget, onSaveConfig, onClose, onOpenSnapshot, onToast }) {
  const titles = {
    history: 'scan history',
    config: 'scan settings',
    target: 'target settings',
    scope: 'scope file',
    auth: 'connection',
  };
  const subtitles = {
    history: 'every previous scan across every target',
    config: 'engines, threads, and scan behavior',
    target: 'headers, cookies, webhooks, and per-target overrides',
    scope: 'allowed and blocked target patterns',
    auth: 'server URL and API key',
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto animate-fade-in relative">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-2">control room</p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink-500 tracking-normal">
            {titles[page] || titles.config}
          </h2>
          <p className="mt-2 text-sm text-ink-200">{subtitles[page] || subtitles.config}</p>
        </div>
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-outline inline-flex items-center gap-2 px-4 py-2.5 rounded-sm uppercase text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            back
          </button>
        </div>
      </div>

      {page === 'history' ? (
        <ScanHistoryPage
          onOpen={onOpenSnapshot}
          onToast={onToast}
          onStartFirstScan={onClose}
        />
      ) : page === 'scope' ? (
        <ScopeEditor embedded onClose={onClose} />
      ) : page === 'auth' ? (
        <ApiKeyPrompt embedded onClose={onClose} />
      ) : page === 'target' ? (
        <TargetSettings target={activeTarget} onClose={onClose} />
      ) : (
        <ScanConfig embedded config={config} onSave={onSaveConfig} onClose={onClose} />
      )}
    </div>
  );
}

function countFindings(job) {
  if (!job?.findings) return 0;
  return Object.values(job.findings).flat().length;
}

function countAssets(job) {
  if (!job) return 0;
  return (
    (job.subdomains?.length || 0)
    + (job.openPorts?.length || 0)
    + (job.liveHosts?.length || 0)
    + (job.tls?.length || 0)
    + (job.endpoints?.length || 0)
  );
}

function collectTechStack(job) {
  const counts = new Map();
  (job?.liveHosts || []).forEach((host) => {
    (host.tech || []).forEach((tech) => {
      const label = String(tech || '').trim();
      if (!label) return;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));
}

function statusTone(status) {
  if (status === 'completed') return 'border-signal-good/60 bg-signal-good/[0.10] text-signal-good';
  if (status === 'running')   return 'border-ink-500/40 bg-ink-500/[0.10] text-ink-500';
  if (status === 'queued')    return 'border-risk-info/40 bg-risk-info/[0.08] text-risk-info';
  if (status === 'failed')    return 'border-signal-bad/60 bg-signal-bad/[0.12] text-signal-bad';
  if (status === 'cancelled') return 'border-signal-bad/50 bg-signal-bad/[0.10] text-signal-bad';
  return 'border-signal-bad/45 bg-signal-bad/[0.08] text-signal-bad';
}

function statusDotTone(status) {
  if (status === 'completed') return 'bg-signal-good';
  if (status === 'running') return 'bg-ink-500 animate-breathe';
  if (status === 'queued') return 'bg-risk-info animate-breathe';
  return 'bg-signal-bad';
}

function TargetHeader({ target, job, children }) {
  const status = job?.status || 'ready';
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="eyebrow">target</p>
          <span className={`status-chip ${statusTone(status)}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotTone(status)}`} />
            {status}
          </span>
        </div>
        <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-semibold text-ink-500 leading-tight break-all">
          {target}
        </h2>
        {(job?.startedAt || job?.queuedAt) && (
          <p className="text-[10px] font-mono uppercase tracking-wide text-ink-200 mt-2">
            {job.status === 'queued' ? 'queued' : 'since'} {new Date(job.startedAt || job.queuedAt).toLocaleTimeString()}
            {job?.completedAt && (
              <> &nbsp;/&nbsp; finished {new Date(job.completedAt).toLocaleTimeString()}</>
            )}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function DashboardOverview({ job, config }) {
  const progress = job?.progress || 0;
  const findings = countFindings(job);
  const enabledTools = Object.values(config.tools || {}).filter(Boolean).length;
  const techStack = collectTechStack(job);
  const metrics = [
    {
      key: 'status',
      label: job?.phase || 'standing by',
      value: job?.status || 'ready',
      tone: statusTone(job?.status),
    },
    {
      key: 'progress',
      label: 'scan progress',
      value: `${progress}%`,
      tone: 'border-ink-500/25 bg-paper-50 text-ink-500',
    },
    {
      key: 'findings',
      label: 'findings',
      value: findings,
      tone: findings
        ? 'border-risk-high/45 bg-risk-high/[0.08] text-risk-high'
        : 'border-signal-good/45 bg-signal-good/[0.08] text-signal-good',
    },
    {
      key: 'assets',
      label: `${enabledTools} tools armed`,
      value: countAssets(job),
      tone: 'border-ink-500/20 bg-paper-50 text-ink-300',
    },
  ];

  return (
    <div className="space-y-2.5 sm:space-y-3">
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3">
        {metrics.map((metric) => (
          <div key={metric.key} className={`metric-tile border ${metric.tone}`}>
            <p className="eyebrow mb-2">{metric.key}</p>
            <p className="font-mono text-xl sm:text-2xl font-semibold text-ink-500 leading-none tabular-nums truncate">
              {metric.value}
            </p>
            <p className="mt-2 text-[11px] font-mono text-ink-200 truncate">{metric.label}</p>
          </div>
        ))}
      </section>

      {techStack.length > 0 && (
        <section className="flex flex-wrap items-center gap-2 rounded-sm border border-ink-500/10 bg-paper-50/70 px-3 py-2.5">
          <span className="eyebrow text-[9px] mr-1">tech</span>
          {techStack.map((tech) => (
            <span
              key={tech.name}
              className="inline-flex items-center gap-1.5 rounded-sm border border-ink-500/15 bg-paper-100/70 px-2 py-1 font-mono text-[10px] text-ink-300"
            >
              {tech.name}
              <span className="text-ink-100">{tech.count}</span>
            </span>
          ))}
        </section>
      )}
    </div>
  );
}

const PIPELINE_PHASES = [
  'subfinder', 'sublist3r', 'ctlog', 'dnsx', 'naabu', 'nmap', 'httpx', 'ffuf',
  'headers', 'takeover', 'tlsx', 'gau', 'wayback', 'urlscan', 'robots', 'katana',
  'nuclei', 'tech', 'sqli', 'xss', 'idor',
];

const BRANDED_STACK = [
  { name: 'Subfinder', logo: '/tool-logos/subfinder.png', url: 'https://github.com/projectdiscovery/subfinder' },
  { name: 'dnsx', logo: '/tool-logos/dnsx.png', url: 'https://github.com/projectdiscovery/dnsx' },
  { name: 'Naabu', logo: '/tool-logos/naabu.png', url: 'https://github.com/projectdiscovery/naabu' },
  { name: 'Nmap', logo: '/tool-logos/nmap.png', url: 'https://nmap.org/' },
  { name: 'httpx', logo: '/tool-logos/httpx.png', url: 'https://github.com/projectdiscovery/httpx' },
  { name: 'ffuf', logo: '/tool-logos/ffuf.png', url: 'https://github.com/ffuf/ffuf' },
  { name: 'tlsx', logo: '/tool-logos/tlsx.png', url: 'https://github.com/projectdiscovery/tlsx' },
  { name: 'Katana', logo: '/tool-logos/katana.png', url: 'https://github.com/projectdiscovery/katana' },
  { name: 'Nuclei', logo: '/tool-logos/nuclei.png', url: 'https://github.com/projectdiscovery/nuclei' },
];

function EmptyState({ onAddTarget, onNavigate }) {
  const [value, setValue] = useState('');
  const [targetError, setTargetError] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const nextTarget = value.trim();
    if (!nextTarget) return;
    if (!normalizeTargetInput(nextTarget)) {
      setTargetError('Enter a domain or an http/https URL.');
      return;
    }
    onAddTarget(value);
    setValue('');
    setTargetError('');
  };

  return (
    <div className="home-page min-h-full w-full animate-fade-in">
      <section className="stellar-screen">
        <div className="stellar-panel">
          <div className="stellar-copy">
            <p className="stellar-label">authorized attack surface mapping</p>
            <h2>Scoped recon, from one console.</h2>
            <p>
              Point Omnisect at a domain or URL you're authorized to test. It maps
              the surface, runs the pipeline, and keeps findings and evidence in
              one place.
            </p>
            <form onSubmit={submit} className="stellar-console">
              <input
                type="text"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  if (targetError) setTargetError('');
                }}
                placeholder="https://example.com/admin?id=1"
                className="stellar-input"
                aria-label="Target domain or URL"
                aria-invalid={!!targetError}
                aria-describedby={targetError ? 'home-target-error' : undefined}
              />
              <button type="submit" className="btn-ink stellar-button" disabled={!value.trim()}>
                set target
              </button>
            </form>
            {targetError && (
              <p id="home-target-error" className="home-target-error" role="alert">
                {targetError}
              </p>
            )}
          </div>

          {/* Honest empty panel — no fake live metrics until a real scan exists */}
          <aside className="home-empty-panel" aria-label="No scans yet">
            <p className="eyebrow mb-3">no scans yet</p>
            <h3 className="font-sans text-xl sm:text-2xl text-ink-500 font-semibold leading-tight">
              Add a target to open the workbench
            </h3>
            <p className="mt-3 text-sm text-ink-200 leading-relaxed">
              Findings, severity counts, and exports show up here after you set a
              target and run a scan. Nothing is live until then.
            </p>
            <ul className="home-empty-steps mt-5" aria-label="What happens next">
              <li>Set a scoped domain or URL</li>
              <li>Open the workbench and begin scan</li>
              <li>Review findings and export evidence</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-heading">
          <h3>What it does</h3>
          <p>
            Built for repeated security work: set a target, watch the pipeline run,
            copy proof, then come back later to see what changed.
          </p>
        </div>
        <div className="home-feature-grid">
          {HOME_FEATURES.map((feature) => (
            <article key={feature.title} className="home-feature">
              <p className="eyebrow">{feature.title}</p>
              <p>{feature.body}</p>
              <div className="home-feature-signal">
                <span>{feature.signal}</span>
                <strong>{feature.detail}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section home-section-compact">
        <div className="home-section-heading">
          <h3>Workflow</h3>
        </div>
        <div className="home-workflow" aria-label="Scan workflow">
          {HOME_WORKFLOW.map(([step, label]) => (
            <div key={step} className="home-workflow-step">
              <span className="home-workflow-index">{step}</span>
              <p>{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section home-section-compact">
        <div className="home-section-heading">
          <h3>Recon stack</h3>
          <p>Recognizable engines, one coordinated run.</p>
        </div>
        <div className="home-stack-carousel" aria-label="Recon stack tools">
          <div className="home-stack-track">
            {BRANDED_STACK.map((tool) => (
              <a
                key={tool.name}
                className="home-stack-logo-link"
                href={tool.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${tool.name} project`}
                title={tool.name}
              >
                <span className="home-stack-logo-frame">
                  <img className="home-stack-logo" src={tool.logo} alt={tool.name} />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <StatusFooter onNavigate={onNavigate} />
    </div>
  );
}

function StatusFooter({ onNavigate }) {
  return (
    <footer className="status-footer">
      <div className="status-footer-inner">
        <div className="status-footer-brand">
          <span className="status-footer-wordmark">Omnisect</span>
        </div>
        <nav className="status-footer-links" aria-label="Footer">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'history', label: 'History' },
            { id: 'scope', label: 'Scope' },
            { id: 'config', label: 'Configure' },
            { id: 'auth', label: 'Connection' },
          ].map((link) => (
            <button key={link.id} type="button" onClick={() => onNavigate(link.id)}>
              {link.label}
            </button>
          ))}
        </nav>
        <span className="status-footer-meta">&copy; {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}

// Top-of-dashboard scan CTA - always visible in the TargetHeader so the user
// never has to scroll through the sidebar to launch / re-launch a scan.
function ScanLauncher({ liveJob, onStart, onCancel, disabled = false }) {
  const status = liveJob?.status;
  const running = status === 'running' || status === 'queued';

  if (running) {
    return (
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        className="btn-ink scan-cta-btn px-6 sm:px-7 py-3 rounded-sm uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
        title={status === 'queued' ? 'Cancel the queued scan' : 'Cancel the running scan'}
      >
        <span className="flex items-center justify-center gap-2.5">
          <Square className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true" />
          {status === 'queued' ? 'cancel queued' : 'cancel scan'}
        </span>
      </button>
    );
  }

  const label = status ? 'scan again' : 'begin scan';
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      className="btn-ink scan-cta-btn scan-cta-pulse px-7 sm:px-8 py-3 rounded-sm uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
      title={disabled ? 'Exit historical view to launch a scan' : 'Launch a scan against this target'}
    >
      <span className="flex items-center justify-center gap-2">
        <Play className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true" />
        {label}
      </span>
    </button>
  );
}

function NoScanState({ target, config, onStart, onOpenConfig }) {
  const enabledTools = Object.values(config?.tools || {}).filter(Boolean).length;

  return (
    <div className="paper-card p-7 sm:p-9 animate-fade-in">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-3">not started</p>
          <h3 className="font-sans text-2xl sm:text-3xl text-ink-500 font-semibold break-all">
            {target}
          </h3>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="status-chip border-signal-good/35 bg-signal-good/[0.06] text-signal-good">
              <span className="h-1.5 w-1.5 rounded-full bg-signal-good" />
              ready
            </span>
            <span className="status-chip border-ink-500/15 bg-paper-50 text-ink-200">
              {enabledTools} tools armed
            </span>
            <span className={`status-chip ${config?.aggressive ? 'border-risk-medium/35 bg-risk-medium/[0.08] text-risk-medium' : 'border-ink-500/15 bg-paper-50 text-ink-200'}`}>
              {config?.aggressive ? 'aggressive' : 'guarded'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onOpenConfig}
            className="btn-outline px-5 py-3 rounded-sm uppercase text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
          >
            configure
          </button>
          <button
            onClick={onStart}
            className="btn-ink px-8 sm:px-10 py-3 rounded-sm uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
          >
            begin scan
          </button>
        </div>
      </div>

      <div className="mt-7 rounded-sm border border-ink-500/10 bg-paper-50/55 px-3 py-3">
        <p className="eyebrow mb-3">pipeline</p>
        <div className="flex flex-wrap gap-1.5">
          {PIPELINE_PHASES.map((phase) => (
            <span key={phase} className="home-pipeline-chip">{phase}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
