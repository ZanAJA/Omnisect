// Subscribes to a job's SSE stream. Replaces 2s polling — server pushes the
// snapshot on connect plus deltas as they happen.

import { useEffect, useRef } from 'react';
import { api } from '../lib/api';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export function useScanEvents(jobId, handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!jobId) return undefined;

    let es = null;
    let reconnectTimer = 0;
    let stopped = false;
    let terminal = false;
    let attempts = 0;

    const parse = (e) => { try { return JSON.parse(e.data); } catch { return null; } };
    const resetBackoff = () => { attempts = 0; };

    const connect = async () => {
      if (stopped || terminal) return;
      let ticket;
      try {
        const issued = await api.createEventsTicket(jobId);
        ticket = issued.ticket;
      } catch (err) {
        console.error('SSE ticket failed', err);
        scheduleReconnect();
        return;
      }
      if (stopped || terminal) return;

      const url = api.eventsUrl(jobId, ticket);
      try {
        es = new EventSource(url);
      } catch (err) {
        console.error('EventSource failed', err);
        scheduleReconnect();
        return;
      }

      const onSnapshotOrUpdate = (e) => {
        resetBackoff();
        const data = parse(e);
        handlersRef.current.onUpdate?.(data);
        if (data?.status && TERMINAL_STATUSES.has(data.status)) terminal = true;
      };
      es.addEventListener('snapshot', onSnapshotOrUpdate);
      es.addEventListener('update',   onSnapshotOrUpdate);
      es.addEventListener('phase',    (e) => { resetBackoff(); handlersRef.current.onPhase?.(parse(e)); });
      es.addEventListener('finding',  (e) => { resetBackoff(); handlersRef.current.onFinding?.(parse(e)); });
      es.addEventListener('warning',  (e) => { resetBackoff(); handlersRef.current.onScanError?.(parse(e)); });
      es.addEventListener('complete', (e) => {
        terminal = true;
        handlersRef.current.onComplete?.(parse(e));
        es?.close();
      });
      es.onerror = () => {
        if (stopped || terminal) return;
        es?.close();
        scheduleReconnect();
      };
    };

    const MAX_ATTEMPTS = 6;
    const scheduleReconnect = () => {
      if (stopped || terminal) return;
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        terminal = true;
        handlersRef.current.onScanError?.({ message: 'lost connection to scan stream; backend offline?' });
        return;
      }
      const delay = Math.min(30000, 1000 * (2 ** Math.min(attempts - 1, 5)));
      if (attempts === 1) handlersRef.current.onReconnect?.({ attempts, delay });
      reconnectTimer = window.setTimeout(() => { connect(); }, delay);
    };

    connect();

    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [jobId]);
}
