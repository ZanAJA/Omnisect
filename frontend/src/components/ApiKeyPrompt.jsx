import { useState } from 'react';
import Eye from 'lucide-react/dist/esm/icons/eye.js';
import EyeOff from 'lucide-react/dist/esm/icons/eye-off.js';
import Save from 'lucide-react/dist/esm/icons/save.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import { storage } from '../lib/storage';
import { getDefaultApiBase, getRuntime, needsAbsoluteApi } from '../lib/platform';
import { useEscape } from '../hooks/useEscape';

export default function ApiKeyPrompt({ onClose, embedded = false }) {
  const showServer = needsAbsoluteApi() || getRuntime() === 'mobile';
  const [value, setValue] = useState(storage.getApiKey());
  const [serverUrl, setServerUrl] = useState(
    storage.getApiBaseUrl() || getDefaultApiBase() || 'http://127.0.0.1:3001',
  );
  const [showing, setShowing] = useState(false);

  useEscape(onClose, !embedded);

  const save = () => {
    if (showServer) storage.setApiBaseUrl(serverUrl.trim());
    storage.setApiKey(value.trim());
    onClose();
    window.dispatchEvent(new CustomEvent('omnisect:auth-updated'));
  };

  const panel = (
      <div
        className={`paper-card w-full ${embedded ? 'max-w-2xl mx-auto' : 'max-w-md'} p-7`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="eyebrow mb-2">{showServer ? 'connection' : 'api key'}</p>
            <h2 id="api-key-prompt-title" className="font-sans text-xl font-semibold text-ink-500">
              {showServer ? 'connect to backend' : 'authorization required'}
            </h2>
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
        <p className="text-sm text-ink-200 leading-relaxed mb-5">
          {showServer
            ? 'Point this app at the Omnisect backend (desktop machine or LAN IP) and paste the API key from its startup log.'
            : "Paste the API key printed in your backend startup log. It's saved in this browser only."}
        </p>

        {showServer && (
          <label className="block mb-4" htmlFor="omnisect-server-url">
            <span className="block font-mono text-[10px] uppercase tracking-wide text-mist-300 mb-2">
              server url
            </span>
            <input
              id="omnisect-server-url"
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://192.168.1.10:3001"
              className="input-ink w-full px-1 py-2 font-mono"
              autoComplete="url"
            />
          </label>
        )}

        <div className="relative mb-6">
          <label className="block" htmlFor="omnisect-api-key">
            <span className="block font-mono text-[10px] uppercase tracking-wide text-mist-300 mb-2">
              api key
            </span>
            <input
              id="omnisect-api-key"
              type={showing ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="64 hex characters"
              autoFocus={!showServer}
              className="input-ink w-full px-1 py-2 font-mono pr-16"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowing(!showing)}
            className="icon-button absolute right-1 bottom-1 h-8 w-8"
            aria-label={showing ? 'Hide API key' : 'Show API key'}
            title={showing ? 'Hide API key' : 'Show API key'}
          >
            {showing ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>

        <div className="flex items-center justify-end gap-3">
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
            className="btn-ink inline-flex items-center gap-2 px-8 py-2.5 rounded-sm uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            save
          </button>
        </div>
      </div>
  );

  if (embedded) return panel;

  return (
    <div
      className="fixed inset-0 bg-paper-100/85 backdrop-blur-md flex items-center justify-center z-[60] p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-prompt-title"
      onClick={onClose}
    >
      {panel}
    </div>
  );
}
