import { describe, expect, it } from 'vitest';
import planner from '../utils/attackSurfacePlanner.js';

const {
  buildToolPlan,
  inspectSignals,
  summarizeAttackSurface,
  surfaceEndpoints,
} = planner;

const report = {
  schema_version: '1.1',
  target: 'https://example.test/',
  completed_at: '2026-09-10T00:00:00Z',
  summary: { pages_visited: 1, websockets_observed: 1 },
  pages: [{
    url: 'https://example.test/',
    security_headers: {},
    missing_security_headers: ['content-security-policy'],
  }],
  forms: [{
    page_url: 'https://example.test/search',
    action: 'https://example.test/search',
    method: 'GET',
    fields: [{ name: 'q', type: 'search' }],
  }],
  requests: [
    { url: 'https://example.test/api/users?id=%5Bredacted%5D', resource_type: 'fetch' },
    { url: 'https://third-party.test/script.js', resource_type: 'script', third_party: true },
  ],
  websockets: ['wss://example.test/events'],
  findings: [
    { id: 'WSM-SURFACE-003', title: 'API endpoint observed', severity: 'LOW' },
  ],
};

describe('attack surface planner', () => {
  it('derives signals and selects evidence-matched checks', () => {
    const signals = inspectSignals(report);
    const plan = buildToolPlan(report, { adaptive: true });
    expect(signals.parameterized).toBe(true);
    expect(signals.hasIdParameter).toBe(true);
    expect(plan.decisions.sqli.selected).toBe(true);
    expect(plan.decisions.xss.selected).toBe(true);
    expect(plan.decisions.idor.selected).toBe(true);
    expect(plan.decisions.headers.selected).toBe(false);
  });

  it('falls back to enabled checks when passive evidence is unavailable', () => {
    const plan = buildToolPlan(null, { adaptive: true });
    expect(plan.evidenceAvailable).toBe(false);
    expect(plan.decisions.nuclei.selected).toBe(true);
    expect(plan.decisions.sqli.selected).toBe(true);
  });

  it('never overrides an explicitly disabled tool', () => {
    const plan = buildToolPlan(report, { adaptive: true, tools: { nuclei: false } });
    expect(plan.decisions.nuclei.selected).toBe(false);
    expect(plan.decisions.nuclei.reason).toMatch(/explicitly disabled/);
  });

  it('keeps only exact-host HTTP endpoints', () => {
    expect(surfaceEndpoints(report, 'example.test')).toEqual([
      'https://example.test/',
      'https://example.test/search?q=',
      'https://example.test/api/users?id=',
    ]);
  });

  it('stores a compact summary rather than the raw crawl', () => {
    const summary = summarizeAttackSurface(report);
    expect(summary.summary.apiEndpoints).toBe(1);
    expect(summary.findings).toHaveLength(1);
    expect(summary.requests).toBeUndefined();
  });
});
