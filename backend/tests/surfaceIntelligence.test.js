import { describe, expect, it } from 'vitest';
import intelligence from '../utils/surfaceIntelligence.js';

const report = {
  target: 'https://example.test/',
  summary: { pages_visited: 2 },
  pages: [
    {
      url: 'https://example.test/',
      technologies: ['Next.js'],
      security_headers: {},
      missing_security_headers: ['content-security-policy'],
    },
  ],
  forms: [{
    page_url: 'https://example.test/search',
    action: 'https://example.test/search',
    method: 'GET',
    fields: [{ name: 'q', type: 'search' }],
  }],
  requests: [
    {
      url: 'https://example.test/api/users/42',
      method: 'GET',
      resource_type: 'fetch',
      body_parameter_names: [],
    },
    {
      url: 'https://example.test/api/users?id=%5Bredacted%5D',
      method: 'GET',
      resource_type: 'fetch',
      body_parameter_names: [],
    },
  ],
  scripts: ['https://example.test/_next/static/app.js'],
  findings: [],
};

describe('surface intelligence', () => {
  it('creates endpoint-level plans without retaining query values', () => {
    const plan = intelligence.deriveEndpointPlans(report, { target: 'example.test' });
    expect(plan.byTool.sqli).toContain('https://example.test/api/users?id=');
    expect(plan.byTool.xss).toContain('https://example.test/search?q=');
    expect(plan.byTool.idor).toContain('https://example.test/api/users/42');
    expect(JSON.stringify(plan)).not.toContain('redacted');
  });

  it('preserves only testable identifiers and prioritizes strong evidence within budget', () => {
    const prioritized = intelligence.deriveEndpointPlans({
      ...report,
      requests: [
        { url: 'https://example.test/api/orders?account=3', method: 'GET', resource_type: 'fetch' },
        { url: 'https://example.test/api/users/42?id=7&token=secret', method: 'GET', resource_type: 'fetch' },
      ],
    }, { target: 'example.test', maxEstimatedRequests: 10 });

    expect(prioritized.estimatedRequests).toBeLessThanOrEqual(10);
    expect(prioritized.byTool.idor).toHaveLength(2);
    expect(prioritized.byTool.idor.some((url) => url.includes('id=7&token='))).toBe(true);
    expect(JSON.stringify(prioritized)).not.toContain('secret');
    expect(prioritized.capped).toBe(true);
  });

  it('graphs observed POST fields without scheduling an incompatible URL validator', () => {
    const planned = intelligence.deriveEndpointPlans({
      target: 'https://example.test/',
      pages: [{ url: 'https://example.test/' }],
      forms: [{
        page_url: 'https://example.test/profile',
        action: 'https://example.test/profile',
        method: 'POST',
        fields: [{ name: 'display_name', type: 'text' }],
      }],
    }, {
      target: 'example.test',
      maxEstimatedRequests: 4,
    });

    expect(planned.byTool.sqli).toEqual([]);
    expect(planned.byTool.xss).toEqual([]);
    expect(planned.estimatedRequests).toBeLessThanOrEqual(4);
    const graph = intelligence.buildAttackGraph({
      target: 'https://example.test/',
      forms: [{
        page_url: 'https://example.test/profile',
        action: 'https://example.test/profile',
        method: 'POST',
        fields: [{ name: 'display_name', type: 'text' }],
      }],
    });
    expect(graph.summary.parameter).toBe(1);
  });

  it('builds a normalized evidence graph', () => {
    const graph = intelligence.buildAttackGraph(report);
    expect(graph.summary.origin).toBe(1);
    expect(graph.summary.endpoint).toBeGreaterThanOrEqual(3);
    expect(graph.summary.parameter).toBeGreaterThanOrEqual(2);
    expect(graph.summary.technology).toBeGreaterThanOrEqual(1);
  });

  it('merges secondary origin reports with deduplication', () => {
    const merged = intelligence.mergeSurfaceReports([
      report,
      { ...report, target: 'https://api.example.test/', pages: [{ url: 'https://api.example.test/' }] },
    ]);
    expect(merged.summary.origins_mapped).toBe(2);
    expect(merged.pages).toHaveLength(2);
  });

  it('loads the versioned rule database', () => {
    const rules = intelligence.loadRuleDatabase();
    expect(rules.schemaVersion).toBe(1);
    expect(rules.endpointRules.length).toBeGreaterThan(3);
  });
});
