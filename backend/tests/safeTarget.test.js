import { describe, it, expect } from 'vitest';
import { isValidDomain, isPrivateIp, isSafeTarget } from '../utils/safeTarget.js';

describe('isValidDomain', () => {
  it('accepts a basic domain', () => {
    expect(isValidDomain('example.com')).toBe(true);
    expect(isValidDomain('sub.example.com')).toBe(true);
  });
  it('rejects garbage', () => {
    expect(isValidDomain('not a domain')).toBe(false);
    expect(isValidDomain('')).toBe(false);
    expect(isValidDomain(null)).toBe(false);
    expect(isValidDomain('http://example.com')).toBe(false);
    expect(isValidDomain('-leading.com')).toBe(false);
  });
});

describe('isPrivateIp', () => {
  it('flags RFC 1918 ranges', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
  });
  it('flags loopback / link-local / metadata', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('0.0.0.0')).toBe(true);
  });
  it('passes public IPs', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('172.32.0.1')).toBe(false);
  });
  it('flags IPv6 loopback / link-local', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
  });
});

describe('isSafeTarget', () => {
  it('rejects localhost outright', async () => {
    const r = await isSafeTarget('localhost');
    expect(r.safe).toBe(false);
  });
  it('rejects raw IPs', async () => {
    const r = await isSafeTarget('8.8.8.8');
    expect(r.safe).toBe(false);
  });
  it('rejects invalid format', async () => {
    const r = await isSafeTarget('not a domain');
    expect(r.safe).toBe(false);
  });
});
