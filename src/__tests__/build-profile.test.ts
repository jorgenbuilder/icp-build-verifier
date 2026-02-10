import { describe, it, expect } from 'vitest';
import { detectBuildProfile, normalizeRepoUrl } from '../extract-build-steps.js';

describe('normalizeRepoUrl', () => {
  it('strips trailing .git', () => {
    expect(normalizeRepoUrl('https://github.com/dfinity/ic.git')).toBe('https://github.com/dfinity/ic');
  });

  it('strips trailing slash', () => {
    expect(normalizeRepoUrl('https://github.com/dfinity/ic/')).toBe('https://github.com/dfinity/ic');
  });

  it('strips /tree/{hash}', () => {
    expect(normalizeRepoUrl('https://github.com/dfinity/ic/tree/abc123def456')).toBe('https://github.com/dfinity/ic');
  });

  it('strips /commit/{hash}', () => {
    expect(normalizeRepoUrl('https://github.com/dfinity/ic/commit/abc123def456')).toBe('https://github.com/dfinity/ic');
  });

  it('strips .git and trailing slash together', () => {
    expect(normalizeRepoUrl('https://github.com/dfinity/ic.git/')).toBe('https://github.com/dfinity/ic');
  });

  it('returns clean URL unchanged', () => {
    expect(normalizeRepoUrl('https://github.com/dfinity/ic')).toBe('https://github.com/dfinity/ic');
  });

  it('handles non-IC repos correctly', () => {
    expect(normalizeRepoUrl('https://github.com/dfinity/dogecoin-canister.git')).toBe('https://github.com/dfinity/dogecoin-canister');
  });
});

describe('detectBuildProfile', () => {
  it('detects dfinity/ic as ic-monorepo', () => {
    expect(detectBuildProfile('https://github.com/dfinity/ic')).toBe('ic-monorepo');
  });

  it('detects dfinity/ic/ (trailing slash) as ic-monorepo', () => {
    expect(detectBuildProfile('https://github.com/dfinity/ic/')).toBe('ic-monorepo');
  });

  it('detects dfinity/ic.git as ic-monorepo', () => {
    expect(detectBuildProfile('https://github.com/dfinity/ic.git')).toBe('ic-monorepo');
  });

  it('detects dfinity/ic-boundary as standard (NOT ic-monorepo)', () => {
    expect(detectBuildProfile('https://github.com/dfinity/ic-boundary')).toBe('standard');
  });

  it('detects dfinity/dogecoin-canister as standard', () => {
    expect(detectBuildProfile('https://github.com/dfinity/dogecoin-canister')).toBe('standard');
  });

  it('detects dfinity/ic with /tree/ suffix as ic-monorepo', () => {
    expect(detectBuildProfile('https://github.com/dfinity/ic/tree/abc123')).toBe('ic-monorepo');
  });

  it('detects dfinity/ic with /commit/ suffix as ic-monorepo', () => {
    expect(detectBuildProfile('https://github.com/dfinity/ic/commit/abc123')).toBe('ic-monorepo');
  });

  it('detects unknown repos as standard', () => {
    expect(detectBuildProfile('https://github.com/some-org/some-repo')).toBe('standard');
  });
});
