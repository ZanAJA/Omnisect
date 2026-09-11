import { describe, expect, it } from 'vitest';
import recorder from '../utils/learningRecorder.js';

describe('learning recorder', () => {
  it('keeps outcomes and excludes raw target, URLs, auth and payloads', () => {
    const record = recorder.learningRecord({
      id: 'job-1',
      target: 'secret.example.test',
      targetSettings: { auth: { cookie: 'session=secret' } },
      phases: { surface: 'done', sqli: 'done' },
      attackGraph: { summary: { endpoint: 3 }, nodes: [{ value: 'https://secret.example.test/' }] },
      toolPlan: {
        plannerVersion: '2',
        signals: { pageCount: 2 },
        endpointPlan: { plans: [{ url: 'https://secret.example.test/?id=' }] },
        decisions: { sqli: { selected: true, confidence: 0.8, reason: 'query parameter' } },
      },
      findings: { critical: [], high: [{ payload: 'secret-payload' }], medium: [], low: [], info: [] },
    });
    const serialized = JSON.stringify(record);
    expect(record.findingCounts.high).toBe(1);
    expect(serialized).not.toContain('secret.example.test');
    expect(serialized).not.toContain('session=secret');
    expect(serialized).not.toContain('secret-payload');
  });

  it('records analyst labels without finding evidence or URLs', () => {
    const record = recorder.recordTriageFeedback(
      {
        id: 'job-1',
        target: 'secret.example.test',
        toolPlan: { signals: { hasApi: true }, decisions: { idor: { selected: true } } },
      },
      {
        id: 'finding-1',
        fingerprint: 'fp-1',
        type: 'idor',
        severity: 'medium',
        url: 'https://secret.example.test/users/42',
        evidence: 'private response',
        triage: { status: 'confirmed', notes: 'secret notes' },
      },
      process.env.TEMP + '/omnisect-learning-test.jsonl',
    );
    const serialized = JSON.stringify(record);
    expect(record.triageStatus).toBe('confirmed');
    expect(serialized).not.toContain('/users/42');
    expect(serialized).not.toContain('private response');
    expect(serialized).not.toContain('secret notes');
  });
});
