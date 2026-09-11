import { useEffect, useRef, useState } from 'react';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.js';
import Download from 'lucide-react/dist/esm/icons/download.js';
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js';
import { api } from '../lib/api';

// Dropdown menu: JSON for tooling, Markdown/CSV/SARIF/HTML for reports.
export default function ReportPanel({ jobId }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const download = async (format) => {
    setOpen(false);
    setDownloading(true);
    try {
      const url = api.reportUrl(jobId, format === 'json' ? null : format);
      const res = await fetch(url, { headers: { 'X-API-Key': localStorage.getItem('omnisect:apiKey') || '' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const ext = { md: 'md', csv: 'csv', sarif: 'sarif', html: 'html', json: 'json' }[format] || 'json';
      a.download = `omnisect-${jobId}-${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Report download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={downloading}
        className="btn-ink px-6 py-2.5 rounded-sm flex items-center gap-2.5 uppercase whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
        aria-haspopup="true"
        aria-expanded={open}
      >
        {downloading ? (
          <>
            <Spinner />
            generating
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>export</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 paper-card min-w-[200px] py-2 z-20 animate-fade-in"
          role="menu"
        >
          <button
            onClick={() => download('md')}
            className="w-full text-left px-4 py-2.5 hover:bg-ink-500/5 transition-colors flex items-baseline justify-between gap-3"
          >
            <span className="font-sans text-sm font-semibold text-ink-500">markdown</span>
            <span className="text-[10px] font-mono text-ink-100">.md</span>
          </button>
          <button
            onClick={() => download('json')}
            className="w-full text-left px-4 py-2.5 hover:bg-ink-500/5 transition-colors flex items-baseline justify-between gap-3"
          >
            <span className="font-sans text-sm font-semibold text-ink-500">json</span>
            <span className="text-[10px] font-mono text-ink-100">.json</span>
          </button>
          <button
            onClick={() => download('csv')}
            className="w-full text-left px-4 py-2.5 hover:bg-ink-500/5 transition-colors flex items-baseline justify-between gap-3"
          >
            <span className="font-sans text-sm font-semibold text-ink-500">csv</span>
            <span className="text-[10px] font-mono text-ink-100">.csv</span>
          </button>
          <button
            onClick={() => download('sarif')}
            className="w-full text-left px-4 py-2.5 hover:bg-ink-500/5 transition-colors flex items-baseline justify-between gap-3"
          >
            <span className="font-sans text-sm font-semibold text-ink-500">sarif</span>
            <span className="text-[10px] font-mono text-ink-100">.sarif</span>
          </button>
          <button
            onClick={() => download('html')}
            className="w-full text-left px-4 py-2.5 hover:bg-ink-500/5 transition-colors flex items-baseline justify-between gap-3"
          >
            <span className="font-sans text-sm font-semibold text-ink-500">html</span>
            <span className="text-[10px] font-mono text-ink-100">.html</span>
          </button>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <LoaderCircle className="w-3 h-3 animate-spin" aria-hidden="true" />;
}
