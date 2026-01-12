import { HttpAgent, Actor } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const GOVERNANCE_CANISTER_ID = 'rrkah-fqaaa-aaaaa-aaaaq-cai';

// Only verify proposals after this ID (approximately Jan 11, 2026)
// This avoids triggering verification for old proposals
const MIN_PROPOSAL_ID = 139900n;

// Only track InstallCode proposals (topic 17)
const TRACKED_TOPICS = [17];

export interface ProposalInfo {
  id: bigint;
  topic: number;
  status: number;
  proposer: bigint;
  title: string;
}

// Exported for testing
export function filterNewProposals(
  proposals: ProposalInfo[],
  trackedTopics: number[],
  existingRunProposalIds: string[],
  minProposalId: bigint
): ProposalInfo[] {
  return proposals.filter(p => {
    const idStr = p.id.toString();

    // Must be after minimum proposal ID
    if (p.id < minProposalId) {
      return false;
    }

    // Must be in tracked topics
    if (!trackedTopics.includes(p.topic)) {
      return false;
    }

    // Must not already have a workflow run
    if (existingRunProposalIds.includes(idStr)) {
      return false;
    }

    return true;
  });
}

// IDL for list_proposals
const governanceIdl = ({ IDL }: { IDL: any }) => {
  const ListProposalInfo = IDL.Record({
    id: IDL.Opt(IDL.Record({ id: IDL.Nat64 })),
    proposer: IDL.Opt(IDL.Record({ id: IDL.Nat64 })),
    proposal: IDL.Opt(IDL.Record({
      title: IDL.Opt(IDL.Text),
      summary: IDL.Text,
      url: IDL.Text,
      action: IDL.Opt(IDL.Variant({
        InstallCode: IDL.Record({
          wasm_module_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
          canister_id: IDL.Opt(IDL.Principal),
        }),
      })),
    })),
    topic: IDL.Int32,
    status: IDL.Int32,
  });

  const ListProposalInfoResponse = IDL.Record({
    proposal_info: IDL.Vec(ListProposalInfo),
  });

  return IDL.Service({
    list_proposals: IDL.Func(
      [IDL.Record({
        include_reward_status: IDL.Vec(IDL.Int32),
        omit_large_fields: IDL.Opt(IDL.Bool),
        before_proposal: IDL.Opt(IDL.Record({ id: IDL.Nat64 })),
        limit: IDL.Nat32,
        exclude_topic: IDL.Vec(IDL.Int32),
        include_all_manage_neuron_proposals: IDL.Opt(IDL.Bool),
        include_status: IDL.Vec(IDL.Int32),
      })],
      [ListProposalInfoResponse],
      ['query']
    ),
  });
};

async function listProposals(limit: number = 100): Promise<ProposalInfo[]> {
  const agent = new HttpAgent({ host: 'https://ic0.app' });

  const governance = Actor.createActor(governanceIdl, {
    agent,
    canisterId: Principal.fromText(GOVERNANCE_CANISTER_ID),
  });

  const result = await governance.list_proposals({
    include_reward_status: [],
    omit_large_fields: [true],
    before_proposal: [],
    limit,
    exclude_topic: [],
    include_all_manage_neuron_proposals: [false],
    include_status: [], // All statuses
  }) as any;

  return result.proposal_info.map((p: any) => ({
    id: p.id?.[0]?.id || 0n,
    topic: Number(p.topic),
    status: Number(p.status),
    proposer: p.proposer?.[0]?.id || 0n,
    title: p.proposal?.[0]?.title?.[0] || 'Untitled',
  }));
}

function getExistingWorkflowRuns(): string[] {
  // Use GitHub CLI to get existing workflow runs for verify.yml
  // Extract proposal IDs from run names like "Verify Proposal #139941"
  try {
    const output = execSync(
      'gh run list --workflow=verify.yml --limit=200 --json displayTitle',
      { encoding: 'utf-8' }
    );
    const runs = JSON.parse(output);
    const proposalIds: string[] = [];

    for (const run of runs) {
      const match = run.displayTitle?.match(/Verify Proposal #(\d+)/);
      if (match) {
        proposalIds.push(match[1]);
      }
    }

    return proposalIds;
  } catch (err) {
    console.error('Warning: Could not fetch existing workflow runs:', err);
    return [];
  }
}

async function main() {
  console.log('');
  console.log('=== ICP Build Verifier - Proposal Monitor ===');
  console.log('');

  console.log(`Tracking topics: ${TRACKED_TOPICS.join(', ')}`);
  console.log(`Minimum proposal ID: ${MIN_PROPOSAL_ID}`);
  console.log('');

  // Fetch recent proposals from NNS
  console.log('Fetching recent proposals from NNS governance...');
  const proposals = await listProposals(100);
  console.log(`Retrieved ${proposals.length} proposals`);

  // Get existing workflow runs to avoid re-triggering
  console.log('Checking existing workflow runs...');
  const existingRuns = getExistingWorkflowRuns();
  console.log(`Found ${existingRuns.length} existing runs`);

  // Filter to new proposals that need verification
  const newProposals = filterNewProposals(
    proposals,
    TRACKED_TOPICS,
    existingRuns,
    MIN_PROPOSAL_ID
  );

  console.log(`Found ${newProposals.length} new proposals matching criteria`);
  console.log('');

  if (newProposals.length === 0) {
    console.log('No new proposals to verify.');
    return;
  }

  // Output the proposal IDs for the workflow to trigger
  const proposalIds = newProposals.map(p => p.id.toString());

  console.log('New proposals to verify:');
  newProposals.forEach(p => {
    console.log(`  - #${p.id}: ${p.title} (topic: ${p.topic})`);
  });
  console.log('');

  // Write proposal IDs to file for workflow to consume
  writeFileSync('new-proposals.json', JSON.stringify(proposalIds, null, 2));
  console.log(`Wrote ${proposalIds.length} proposal IDs to new-proposals.json`);

  // Set GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    const output = `proposal_ids=${JSON.stringify(proposalIds)}\ncount=${proposalIds.length}`;
    writeFileSync(process.env.GITHUB_OUTPUT, output, { flag: 'a' });
  }
}

// Only run main if this is the entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error('Error monitoring proposals:', err);
    process.exit(1);
  });
}
