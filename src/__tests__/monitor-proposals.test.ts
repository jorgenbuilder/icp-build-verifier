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

  const defaultMinId = 139900n;

  it('filters proposals by tracked topics', () => {
    const proposals = [
      createProposal(140001, 17), // InstallCode - tracked
      createProposal(140002, 5),  // ManageNeuron - not tracked
      createProposal(140003, 17), // InstallCode - tracked
      createProposal(140004, 9),  // UpgradeRootCanister - not tracked
    ];

    const result = filterNewProposals(proposals, [17], [], defaultMinId);

    expect(result).toHaveLength(2);
    expect(result.map(p => Number(p.id))).toEqual([140001, 140003]);
  });

  it('excludes proposals with existing workflow runs', () => {
    const proposals = [
      createProposal(140100, 17),
      createProposal(140101, 17),
      createProposal(140102, 17),
    ];

    const existingRuns = ['140100', '140102'];
    const result = filterNewProposals(proposals, [17], existingRuns, defaultMinId);

    expect(result).toHaveLength(1);
    expect(Number(result[0].id)).toBe(140101);
  });

  it('excludes proposals before minimum ID', () => {
    const proposals = [
      createProposal(139800, 17), // Before min
      createProposal(139900, 17), // At min
      createProposal(140000, 17), // After min
    ];

    const result = filterNewProposals(proposals, [17], [], 139900n);

    expect(result).toHaveLength(2);
    expect(result.map(p => Number(p.id))).toEqual([139900, 140000]);
  });

  it('handles empty proposal list', () => {
    const result = filterNewProposals([], [17], [], defaultMinId);
    expect(result).toHaveLength(0);
  });

  it('handles multiple tracked topics', () => {
    const proposals = [
      createProposal(140001, 17),
      createProposal(140002, 9),
      createProposal(140003, 5),
    ];

    const result = filterNewProposals(proposals, [17, 9], [], defaultMinId);

    expect(result).toHaveLength(2);
    expect(result.map(p => Number(p.id))).toEqual([140001, 140002]);
  });

  it('returns empty when no proposals match criteria', () => {
    const proposals = [
      createProposal(140001, 5),  // wrong topic
      createProposal(140002, 17), // right topic but already has run
    ];

    const result = filterNewProposals(proposals, [17], ['140002'], defaultMinId);

    expect(result).toHaveLength(0);
  });

  it('returns on-topic unverified proposal for verification (happy path)', () => {
    const proposals = [
      createProposal(140000, 17), // New InstallCode proposal
    ];

    const result = filterNewProposals(proposals, [17], [], defaultMinId);

    expect(result).toHaveLength(1);
    expect(Number(result[0].id)).toBe(140000);
    expect(result[0].topic).toBe(17);
  });

  it('ignores off-topic proposals completely', () => {
    const proposals = [
      createProposal(140001, 5),  // ManageNeuron
      createProposal(140002, 5),  // ManageNeuron
      createProposal(140003, 9),  // UpgradeRootCanister
    ];

    const result = filterNewProposals(proposals, [17], [], defaultMinId);

    expect(result).toHaveLength(0);
  });

  it('ignores proposals that already have workflow runs', () => {
    const proposals = [
      createProposal(140001, 17), // Previously run
    ];

    const result = filterNewProposals(proposals, [17], ['140001'], defaultMinId);

    expect(result).toHaveLength(0);
  });
});
