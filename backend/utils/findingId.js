// Deterministic fingerprint for a finding — used to dedupe within a scan and
// to flag "new since previous scan" when diffing.

const crypto = require('crypto');

function fingerprint(finding) {
  const key = [
    finding.type || '',
    finding.template || '',
    finding.url || '',
    finding.severity || '',
    finding.payload || '',
  ].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function diffFindings(currentFindings, previousFindings) {
  const prev = new Set(previousFindings.map((f) => f.fingerprint).filter(Boolean));
  return currentFindings.map((f) => ({
    ...f,
    isNew: prev.size === 0 ? false : !prev.has(f.fingerprint),
  }));
}

function applyFingerprintsAndDiff(findingsBucket, previousFindingsFlat) {
  // findingsBucket: { critical: [], high: [], ... }
  // previousFindingsFlat: [] of all previous findings (flat)
  const out = {};
  for (const [sev, list] of Object.entries(findingsBucket)) {
    const withFp = list.map((f) => ({ ...f, fingerprint: f.fingerprint || fingerprint(f) }));
    out[sev] = diffFindings(withFp, previousFindingsFlat);
  }
  return out;
}

module.exports = { fingerprint, diffFindings, applyFingerprintsAndDiff };
