const { spawn } = require('child_process');
const { getToolInvocation } = require('./toolChecker');

// Runs a child process and returns { stdout, stderr, code }.
// If options.onProcess is provided, it's called synchronously with the ChildProcess
// so callers can track it for cancellation.
function runTool(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const resolved = getToolInvocation(command, args);
    const timeout = options.timeout || 120000;
    let proc;
    try {
      proc = spawn(resolved.command, resolved.args);
    } catch (err) {
      return reject(new Error(`failed to spawn ${command}: ${err.message}`));
    }

    options.onProcess?.(proc);

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill('SIGTERM'); } catch {}
      const err = new Error(`${command} timed out after ${timeout}ms`);
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    }, timeout);

    proc.stdout.on('data', (chunk) => {
      stdout += chunk;
      options.onData?.(chunk.toString());
    });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({ stdout, stderr, code });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error(`failed to run ${command}: ${err.message}`));
      }
    });

    if (options.stdin) {
      try {
        proc.stdin.write(options.stdin);
        proc.stdin.end();
      } catch (err) {
        // ignore EPIPE if process exited before stdin write
      }
    }
  });
}

function injectPayload(url, payload) {
  try {
    const u = new URL(url);
    const firstKey = [...u.searchParams.keys()][0];
    if (firstKey) {
      u.searchParams.set(firstKey, u.searchParams.get(firstKey) + payload);
    }
    return u.toString();
  } catch {
    return url + encodeURIComponent(payload);
  }
}

module.exports = { runTool, injectPayload };
