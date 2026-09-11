// Central path resolution for Omnisect.
// Override with env when packaging or moving tools:
//   OMNISECT_ROOT, OMNISECT_TOOLS_DIR, OMNISECT_DATA_DIR, SURFACE_MAPPER_BIN

const fs = require('fs');
const path = require('path');

function exists(p) {
  try {
    return Boolean(p) && fs.existsSync(p);
  } catch {
    return false;
  }
}

/** Repo root (folder that contains backend/, frontend/, package.json). */
function getRepoRoot() {
  if (process.env.OMNISECT_ROOT) {
    return path.resolve(process.env.OMNISECT_ROOT);
  }

  // backend/utils -> ../../
  const fromModule = path.resolve(__dirname, '..', '..');
  if (exists(path.join(fromModule, 'backend', 'package.json'))) {
    return fromModule;
  }

  return path.resolve(process.cwd());
}

function getBackendRoot() {
  return path.join(getRepoRoot(), 'backend');
}

function getFrontendRoot() {
  return path.join(getRepoRoot(), 'frontend');
}

function getSharedRoot() {
  return path.join(getRepoRoot(), 'shared');
}

function getToolsDir() {
  if (process.env.OMNISECT_TOOLS_DIR) {
    return path.resolve(process.env.OMNISECT_TOOLS_DIR);
  }
  return path.join(getBackendRoot(), 'tools');
}

function getDataDir() {
  if (process.env.OMNISECT_DATA_DIR) {
    return path.resolve(process.env.OMNISECT_DATA_DIR);
  }
  return path.join(getBackendRoot(), 'data');
}

function getToolBin(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return path.join(getToolsDir(), 'bin', exe);
}

function getToolScript(name) {
  return path.join(getToolsDir(), 'js', `${name}.js`);
}

function getWordlist(name = 'content-small.txt') {
  return path.join(getToolsDir(), 'wordlists', name);
}

/**
 * Resolve the surface-mapper binary.
 * Order: SURFACE_MAPPER_BIN → local tools/bin → sibling ../web-surface-mapper venv.
 */
function getSurfaceMapperBin() {
  if (process.env.SURFACE_MAPPER_BIN) {
    return path.resolve(process.env.SURFACE_MAPPER_BIN);
  }

  const local = getToolBin('surface-mapper');
  if (exists(local)) return local;

  const executable = process.platform === 'win32' ? 'surface-mapper.exe' : 'surface-mapper';
  const sibling = path.resolve(
    getRepoRoot(),
    '..',
    'web-surface-mapper',
    '.venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    executable,
  );
  if (exists(sibling)) return sibling;

  return null;
}

module.exports = {
  getRepoRoot,
  getBackendRoot,
  getFrontendRoot,
  getSharedRoot,
  getToolsDir,
  getDataDir,
  getToolBin,
  getToolScript,
  getWordlist,
  getSurfaceMapperBin,
};
