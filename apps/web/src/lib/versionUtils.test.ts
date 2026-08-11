import { describe, expect, it } from 'vitest';
import { compareVersions, normalizeVersion } from './versionUtils';

describe('normalizeVersion', () => {
  it('keeps a usable tag and drops the empty ones', () => {
    expect(normalizeVersion(' v1.2.3 ')).toBe('v1.2.3');
    expect(normalizeVersion('')).toBeNull();
    expect(normalizeVersion('   ')).toBeNull();
    expect(normalizeVersion(undefined)).toBeNull();
    expect(normalizeVersion(null)).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders releases numerically, not lexically', () => {
    expect(compareVersions('v1.2.3', 'v1.2.4')).toBeLessThan(0);
    expect(compareVersions('v1.10.0', 'v1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('v2.0.0', 'v10.0.0')).toBeLessThan(0);
  });

  it('ignores the tag prefix and pads missing segments', () => {
    expect(compareVersions('1.2.3', 'v1.2.3')).toBe(0);
    expect(compareVersions('v1.2', 'v1.2.0')).toBe(0);
    expect(compareVersions('v1.2', 'v1.2.1')).toBeLessThan(0);
  });

  it('ranks a prerelease below its release', () => {
    expect(compareVersions('v1.2.3-rc.1', 'v1.2.3')).toBeLessThan(0);
    expect(compareVersions('v1.2.3-rc.1', 'v1.2.3-rc.2')).toBeLessThan(0);
    expect(compareVersions('v1.2.3-rc', 'v1.2.3-rc.1')).toBeLessThan(0);
    expect(compareVersions('v1.2.3-alpha', 'v1.2.3-beta')).toBeLessThan(0);
    expect(compareVersions('v1.2.3-1', 'v1.2.3-alpha')).toBeLessThan(0);
  });

  it('ignores build metadata', () => {
    expect(compareVersions('v1.2.3+abc', 'v1.2.3')).toBe(0);
  });

  it('treats a missing version as the oldest', () => {
    expect(compareVersions(null, 'v1.0.0')).toBeLessThan(0);
    expect(compareVersions('v1.0.0', null)).toBeGreaterThan(0);
    expect(compareVersions(null, null)).toBe(0);
    expect(compareVersions('', ' ')).toBe(0);
  });

  it('falls back to a string comparison for tags it cannot parse', () => {
    expect(compareVersions('nightly', 'nightly')).toBe(0);
    expect(compareVersions('nightly-a', 'nightly-b')).toBeLessThan(0);
  });
});
