import { describe, it, expect } from 'vitest';
import { fingerprint, diffFindings } from '../utils/findingId.js';

describe('fingerprint', () => {
  it('is deterministic for the same finding', () => {
    const f = { type: 'nuclei', template: 'cve-2024-1', url: 'https://x/y', severity: 'high' };
    expect(fingerprint(f)).toBe(fingerprint(f));
  });
  it('differs across different findings', () => {
    const a = { type: 'nuclei', template: 'cve-2024-1', url: 'https://x/y', severity: 'high' };
    const b = { type: 'nuclei', template: 'cve-2024-2', url: 'https://x/y', severity: 'high' };
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });
});

describe('diffFindings', () => {
  it('marks all as not-new when previous is empty', () => {
    const f = { fingerprint: 'a' };
    expect(diffFindings([f], [])[0].isNew).toBe(false);
  });
  it('marks unseen findings as new', () => {
    const out = diffFindings([{ fingerprint: 'a' }, { fingerprint: 'b' }], [{ fingerprint: 'a' }]);
    expect(out[0].isNew).toBe(false);
    expect(out[1].isNew).toBe(true);
  });
});
