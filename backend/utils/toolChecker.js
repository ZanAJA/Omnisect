// Probes external tools on startup so the UI can show "subfinder missing" instead of
// silently producing zero subdomains.

const { spawn } = require('child_process');
const fs = require('fs');
const {
  getToolBin,
  getToolScript,
  getSurfaceMapperBin,
} = require('./paths');

const BUILTIN_TOOLS = ['headers', 'takeover'];
const TOOLS = [
  'surface-mapper',
  'subfinder', 'sublist3r', 'ctlog', 'dnsx', 'naabu', 'nmap', 'httpx', 'headers',
  'takeover', 'tlsx', 'gau', 'wayback', 'urlscan', 'robots', 'ffuf', 'katana',
  'nuclei', 'curl',
];

let cache = null;

function envName(name) {
  return `${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_BIN`;
}

function getToolCommand(name) {
  const configured = process.env[envName(name)];
  if (configured) return configured;

  if (name === 'surface-mapper') {
    const bundled = getSurfaceMapperBin();
    if (bundled) return bundled;
  }

  const localExe = getToolBin(name);
  if (fs.existsSync(localExe)) return localExe;

  const localScript = getToolScript(name);
  if (fs.existsSync(localScript)) return process.execPath;

  return name;
}

function getToolInvocation(name, args = []) {
  const configured = process.env[envName(name)];
  if (configured) return { command: configured, args };

  if (name === 'surface-mapper') {
    const command = getToolCommand(name);
    if (command !== name) return { command, args };
  }

  const localExe = getToolBin(name);
  if (fs.existsSync(localExe)) return { command: localExe, args };

  const localScript = getToolScript(name);
  if (fs.existsSync(localScript)) return { command: process.execPath, args: [localScript, ...args] };

  return { command: name, args };
}

function probe(name) {
  return new Promise((resolve) => {
    if (BUILTIN_TOOLS.includes(name)) return resolve(true);
    const { command, args } = getToolInvocation(name, ['--help']);
    let proc;
    try {
      proc = spawn(command, args);
    } catch {
      return resolve(false);
    }

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      try { proc.kill(); } catch {}
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), 3000);
    proc.on('error', () => { clearTimeout(timer); finish(false); });
    proc.on('exit', () => { clearTimeout(timer); finish(true); });
    proc.stdout?.on('data', () => {});
    proc.stderr?.on('data', () => {});
  });
}

async function checkAllTools() {
  const entries = await Promise.all(TOOLS.map(async (name) => [name, await probe(name)]));
  cache = Object.fromEntries(entries);
  return cache;
}

function getCachedToolStatus() {
  return cache || Object.fromEntries(TOOLS.map((t) => [t, null]));
}

module.exports = { checkAllTools, getCachedToolStatus, getToolCommand, getToolInvocation, TOOLS };
