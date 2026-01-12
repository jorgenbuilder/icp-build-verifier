import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

// Import after mocking
import { computeSha256, compareHashes } from '../compare-hash.js';

describe('compare-hash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('compareHashes', () => {
    it('returns match when hashes are equal', () => {
      const result = compareHashes(
        '9a8a90c6bbfd1c4a411f8347ffba5a0b3b33441e20809701916fa93bca186251',
        '9a8a90c6bbfd1c4a411f8347ffba5a0b3b33441e20809701916fa93bca186251'
      );

      expect(result.match).toBe(true);
      expect(result.status).toBe('verified');
    });

    it('returns match when hashes differ only in case', () => {
      const result = compareHashes(
        '9A8A90C6BBFD1C4A411F8347FFBA5A0B3B33441E20809701916FA93BCA186251',
        '9a8a90c6bbfd1c4a411f8347ffba5a0b3b33441e20809701916fa93bca186251'
      );

      expect(result.match).toBe(true);
      expect(result.status).toBe('verified');
    });

    it('returns failed when hashes do not match', () => {
      const result = compareHashes(
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '9a8a90c6bbfd1c4a411f8347ffba5a0b3b33441e20809701916fa93bca186251'
      );

      expect(result.match).toBe(false);
      expect(result.status).toBe('failed');
    });

    it('returns error when expected hash is null', () => {
      const result = compareHashes(
        '9a8a90c6bbfd1c4a411f8347ffba5a0b3b33441e20809701916fa93bca186251',
        null
      );

      expect(result.match).toBe(false);
      expect(result.status).toBe('error');
    });

    it('returns error when expected hash is empty string', () => {
      const result = compareHashes(
        '9a8a90c6bbfd1c4a411f8347ffba5a0b3b33441e20809701916fa93bca186251',
        ''
      );

      expect(result.match).toBe(false);
      expect(result.status).toBe('error');
    });
  });

  describe('computeSha256', () => {
    it('computes correct SHA256 hash for file content', () => {
      const testContent = Buffer.from('hello world');
      vi.mocked(readFileSync).mockReturnValue(testContent);

      const result = computeSha256('/test/file.wasm');

      // Known SHA256 of "hello world"
      const expectedHash = createHash('sha256').update(testContent).digest('hex');
      expect(result).toBe(expectedHash);
      expect(result).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });

    it('reads the correct file path', () => {
      vi.mocked(readFileSync).mockReturnValue(Buffer.from('test'));

      computeSha256('/path/to/canister.wasm');

      expect(readFileSync).toHaveBeenCalledWith('/path/to/canister.wasm');
    });
  });
});
