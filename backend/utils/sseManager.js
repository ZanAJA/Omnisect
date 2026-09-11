// Simple SSE pub/sub. The scan pipeline publishes events as they happen
// (phase changes, new findings, completion) and connected clients stream them
// in real time instead of polling every 2 seconds.

const subscribers = new Map(); // jobId -> Set<res>

function format(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function subscribe(jobId, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // for nginx
  res.flushHeaders?.();
  res.write(`retry: 4000\n\n`);

  if (!subscribers.has(jobId)) subscribers.set(jobId, new Set());
  subscribers.get(jobId).add(res);

  const keepalive = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch {}
  }, 25_000);

  const cleanup = () => {
    clearInterval(keepalive);
    subscribers.get(jobId)?.delete(res);
    if (subscribers.get(jobId)?.size === 0) subscribers.delete(jobId);
  };

  res.on('close', cleanup);
  res.on('error', cleanup);
}

function publish(jobId, event, data) {
  const subs = subscribers.get(jobId);
  if (!subs?.size) return;
  const msg = format(event, data);
  for (const res of subs) {
    try { res.write(msg); } catch {}
  }
}

function closeAll(jobId) {
  const subs = subscribers.get(jobId);
  if (!subs) return;
  for (const res of subs) {
    try { res.end(); } catch {}
  }
  subscribers.delete(jobId);
}

module.exports = { subscribe, publish, closeAll };
