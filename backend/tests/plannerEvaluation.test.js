import { describe, expect, it } from 'vitest';
import evaluation from '../utils/plannerEvaluation.js';

describe('planner evaluation', () => {
  it('calculates labeled precision and refuses to invent recall', () => {
    const result = evaluation.evaluateRecords([
      { event: 'triage-feedback', findingType: 'xss', triageStatus: 'confirmed' },
      { event: 'triage-feedback', findingType: 'xss', triageStatus: 'false_positive' },
      { event: 'triage-feedback', findingType: 'idor', triageStatus: 'reviewing' },
    ]);
    expect(result.totals.precision).toBe(0.5);
    expect(result.byType.xss.precision).toBe(0.5);
    expect(result.byType.idor.unlabeled).toBe(1);
    expect(result.recall).toBeUndefined();
  });
});
