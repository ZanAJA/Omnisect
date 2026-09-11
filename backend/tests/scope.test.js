import { describe, it, expect, vi } from 'vitest';

// Mock the storage layer so tests don't touch disk
vi.mock('../utils/storage.js', () => {
  let scope = { allowed: [], blocked: [] };
  return {
    safeJsonRead: () => scope,
    atomicWrite: (_, data) => { scope = data; },
    ROOT: '/tmp',
  };
});

const { saveScope, loadScope, isInScope, scopeMiddleware } = await import('../utils/scope.js');

describe('scope', () => {
  it('stores scope lists for UI/reference', () => {
    saveScope({ allowed: ['*.example.com'], blocked: ['admin.example.com'] });
    expect(loadScope()).toEqual({ allowed: ['*.example.com'], blocked: ['admin.example.com'] });
  });

  it('does not reject scans from the scope helper', () => {
    saveScope({ allowed: ['*.example.com'], blocked: ['admin.example.com'] });
    expect(isInScope('other.com')).toMatchObject({ inScope: true, disabled: true });
    expect(isInScope('admin.example.com')).toMatchObject({ inScope: true, disabled: true });
  });

  it('middleware always passes through', () => {
    const req = { body: { domain: 'other.com' } };
    const res = { status: vi.fn(), json: vi.fn() };
    const next = vi.fn();
    scopeMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
