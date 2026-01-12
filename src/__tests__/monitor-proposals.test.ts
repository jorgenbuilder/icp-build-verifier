import { describe, it, expect } from 'vitest';
import { filterNewProposals, ProposalInfo } from '../monitor-proposals.js';

describe('filterNewProposals', () => {
  const createProposal = (id: number, topic: number): ProposalInfo => ({
    id: BigInt(id),
    topic,
    status: 1,
    proposer: BigInt(1),
    title: `Proposal ${id}`,
  });

  it('filters proposals by tracked topics', () => {
    const proposals = [
      createProposal(1, 17), // InstallCode - tracked
      createProposal(2, 5),  // ManageNeuron - not tracked
      createProposal(3, 17), // InstallCode - tracked
      createProposal(4, 9),  // UpgradeRootCanister - not tracked
    ];

    const result = filterNewProposals(proposals, [17], []);

    expect(result).toHaveLength(2);
    expect(result.map(p => Number(p.id))).toEqual([1, 3]);
  });

  it('excludes already-verified proposals', () => {
    const proposals = [
      createProposal(100, 17),
      createProposal(101, 17),
      createProposal(102, 17),
    ];

    const verifiedIds = ['100', '102'];
    const result = filterNewProposals(proposals, [17], verifiedIds);

    expect(result).toHaveLength(1);
    expect(Number(result[0].id)).toBe(101);
  });

  it('handles empty proposal list', () => {
    const result = filterNewProposals([], [17], []);
    expect(result).toHaveLength(0);
  });

  it('handles multiple tracked topics', () => {
    const proposals = [
      createProposal(1, 17),
      createProposal(2, 9),
      createProposal(3, 5),
    ];

    const result = filterNewProposals(proposals, [17, 9], []);

    expect(result).toHaveLength(2);
    expect(result.map(p => Number(p.id))).toEqual([1, 2]);
  });

  it('returns empty when no proposals match criteria', () => {
    const proposals = [
      createProposal(1, 5),  // wrong topic
      createProposal(2, 17), // right topic but already verified
    ];

    const result = filterNewProposals(proposals, [17], ['2']);

    expect(result).toHaveLength(0);
  });

  it('handles bigint proposal IDs correctly', () => {
    const proposals = [
      { id: BigInt('139941'), topic: 17, status: 1, proposer: BigInt(1), title: 'Test' },
    ];

    // Already verified
    const result1 = filterNewProposals(proposals, [17], ['139941']);
    expect(result1).toHaveLength(0);

    // Not verified
    const result2 = filterNewProposals(proposals, [17], ['139940']);
    expect(result2).toHaveLength(1);
  });

  it('returns on-topic unverified proposal for verification (happy path)', () => {
    // Simulate: new InstallCode proposal arrives, should trigger verification
    const proposals = [
      createProposal(140000, 17), // New InstallCode proposal
    ];

    const result = filterNewProposals(proposals, [17], []);

    expect(result).toHaveLength(1);
    expect(Number(result[0].id)).toBe(140000);
    expect(result[0].topic).toBe(17);
  });

  it('ignores off-topic proposals completely', () => {
    // Simulate: ManageNeuron proposals arrive, should be ignored
    const proposals = [
      createProposal(1, 5),  // ManageNeuron
      createProposal(2, 5),  // ManageNeuron
      createProposal(3, 9),  // UpgradeRootCanister
    ];

    const result = filterNewProposals(proposals, [17], []);

    expect(result).toHaveLength(0);
  });

  it('ignores already-tracked proposals even if on-topic', () => {
    // Simulate: proposal was already verified in a previous run
    const proposals = [
      createProposal(139941, 17), // Previously verified
    ];

    const result = filterNewProposals(proposals, [17], ['139941']);

    expect(result).toHaveLength(0);
  });
});
