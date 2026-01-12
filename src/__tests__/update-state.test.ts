import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Import after mocking
import { loadState, saveState, updateProposalState } from '../update-state.js';

describe('update-state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadState', () => {
    it('returns parsed state when file exists', () => {
      const mockState = {
        lastCheckedTimestamp: 1234567890,
        proposals: {
          '123': { status: 'verified', wasmHashMatch: true, verifiedAt: '2026-01-11T00:00:00Z' }
        }
      };

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockState));

      const result = loadState();

      expect(result).toEqual(mockState);
      expect(readFileSync).toHaveBeenCalledWith('state/verified-proposals.json', 'utf-8');
    });

    it('returns default state when file does not exist', () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = loadState();

      expect(result).toEqual({ lastCheckedTimestamp: 0, proposals: {} });
    });

    it('returns default state when file contains invalid JSON', () => {
      vi.mocked(readFileSync).mockReturnValue('invalid json');

      const result = loadState();

      expect(result).toEqual({ lastCheckedTimestamp: 0, proposals: {} });
    });
  });

  describe('saveState', () => {
    it('writes state as formatted JSON', () => {
      const state = {
        lastCheckedTimestamp: 1234567890,
        proposals: { '123': { status: 'verified' as const, wasmHashMatch: true, verifiedAt: '2026-01-11T00:00:00Z' } }
      };

      saveState(state);

      expect(writeFileSync).toHaveBeenCalledWith(
        'state/verified-proposals.json',
        JSON.stringify(state, null, 2)
      );
    });
  });

  describe('updateProposalState', () => {
    it('adds new proposal to empty state', () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        lastCheckedTimestamp: 0,
        proposals: {}
      }));

      const result = updateProposalState('12345', {
        status: 'pending',
        wasmHashMatch: false
      });

      expect(result.status).toBe('pending');
      expect(result.wasmHashMatch).toBe(false);
      expect(result.verifiedAt).toBeDefined();
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('updates existing proposal', () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        lastCheckedTimestamp: 1000,
        proposals: {
          '12345': { status: 'pending', wasmHashMatch: false, verifiedAt: '2026-01-10T00:00:00Z' }
        }
      }));

      const result = updateProposalState('12345', {
        status: 'verified',
        wasmHashMatch: true,
        actualHash: 'abc123'
      });

      expect(result.status).toBe('verified');
      expect(result.wasmHashMatch).toBe(true);
      expect(result.actualHash).toBe('abc123');
    });

    it('preserves existing fields when updating', () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        lastCheckedTimestamp: 1000,
        proposals: {
          '12345': {
            status: 'pending',
            wasmHashMatch: false,
            verifiedAt: '2026-01-10T00:00:00Z',
            expectedHash: 'expected123'
          }
        }
      }));

      const result = updateProposalState('12345', {
        status: 'verified',
        wasmHashMatch: true
      });

      expect(result.expectedHash).toBe('expected123');
      expect(result.status).toBe('verified');
    });
  });
});
