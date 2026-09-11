import { useEffect } from 'react';

const TONES = {
  good: 'toast-tone-good',
  bad: 'toast-tone-bad',
  warn: 'toast-tone-warn',
  info: 'toast-tone-info',
};

export default function ToastStack({ toasts, onDismiss }) {
  useEffect(() => {
    const timers = toasts.map((toast) => (
      setTimeout(() => onDismiss(toast.id), toast.timeout || 5200)
    ));
    return () => timers.forEach(clearTimeout);
  }, [toasts, onDismiss]);

  if (!toasts.length) return null;

  return (
    <div className="toast-stack">
      {toasts.map((toast) => {
        const isError = toast.type === 'bad' || toast.type === 'error';
        return (
          <div
            key={toast.id}
            className={`toast-card animate-slide-in-left ${TONES[toast.type] || TONES.info}`}
            role={isError ? 'alert' : 'status'}
          >
            <div className="toast-card-inner">
              <div className="toast-dot" aria-hidden="true" />
              <div className="toast-copy">
                <p className="toast-title">{toast.title}</p>
                {toast.message && (
                  <p className="toast-message">{toast.message}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="toast-dismiss"
                aria-label="Dismiss notification"
              >
                x
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
