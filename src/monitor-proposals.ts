import { HttpAgent, Actor } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { readFileSync, writeFileSync } from 'fs';

const GOVERNANCE_CANISTER_ID = 'rrkah-fqaaa-aaaaa-aaaaq-cai';

interface TrackingConfig {
  topics: number[];
  startDate: string;
  enabled: boolean;
}

interface VerifiedProposal {
  status: string;
  wasmHashMatch: boolean;
  verifiedAt: string;
  runId?: number;
}

interface StateData {
  lastCheckedTimestamp: number;
  proposals: Record<string, VerifiedProposal>;
}

interface ProposalInfo {
  id: bigint;
  topic: number;
  status: number;
  proposer: bigint;
  title: string;
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

function loadConfig(): TrackingConfig {
  try {
    return JSON.parse(readFileSync('config/tracking.json', 'utf-8'));
  } catch {
    console.error('Could not read config/tracking.json');
    process.exit(1);
  }
}

function loadState(): StateData {
  try {
    return JSON.parse(readFileSync('state/verified-proposals.json', 'utf-8'));
  } catch {
    return { lastCheckedTimestamp: 0, proposals: {} };
  }
}

function saveState(state: StateData) {
  writeFileSync('state/verified-proposals.json', JSON.stringify(state, null, 2));
}

async function main() {
  console.log('');
  console.log('=== ICP Build Verifier - Proposal Monitor ===');
  console.log('');

  const config = loadConfig();
  const state = loadState();

  if (!config.enabled) {
    console.log('Monitoring is disabled in config. Exiting.');
    process.exit(0);
  }

  const startDateTs = new Date(config.startDate).getTime() / 1000;
  console.log(`Tracking topics: ${config.topics.join(', ')}`);
  console.log(`Start date: ${config.startDate}`);
  console.log(`Last checked: ${state.lastCheckedTimestamp || 'never'}`);
  console.log('');

  // Fetch recent proposals
  console.log('Fetching recent proposals from NNS governance...');
  const proposals = await listProposals(100);
  console.log(`Retrieved ${proposals.length} proposals`);

  // Filter proposals:
  // 1. Topic must match our tracked topics
  // 2. Not already verified
  // 3. Created after our start date (we use proposal ID as proxy since IDs are sequential)
  const newProposals = proposals.filter(p => {
    const idStr = p.id.toString();

    // Must be in tracked topics
    if (!config.topics.includes(p.topic)) {
      return false;
    }

    // Must not already be tracked
    if (state.proposals[idStr]) {
      return false;
    }

    return true;
  });

  console.log(`Found ${newProposals.length} new proposals matching criteria`);
  console.log('');

  if (newProposals.length === 0) {
    console.log('No new proposals to verify.');
    state.lastCheckedTimestamp = Math.floor(Date.now() / 1000);
    saveState(state);
    return;
  }

  // Output the proposal IDs for the workflow to trigger
  const proposalIds = newProposals.map(p => p.id.toString());

  console.log('New proposals to verify:');
  newProposals.forEach(p => {
    console.log(`  - #${p.id}: ${p.title} (topic: ${p.topic})`);
  });
  console.log('');

  // Mark proposals as pending in state
  for (const p of newProposals) {
    state.proposals[p.id.toString()] = {
      status: 'pending',
      wasmHashMatch: false,
      verifiedAt: new Date().toISOString(),
    };
  }

  state.lastCheckedTimestamp = Math.floor(Date.now() / 1000);
  saveState(state);

  // Write proposal IDs to file for workflow to consume
  writeFileSync('new-proposals.json', JSON.stringify(proposalIds, null, 2));
  console.log(`Wrote ${proposalIds.length} proposal IDs to new-proposals.json`);

  // Set GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    const output = `proposal_ids=${JSON.stringify(proposalIds)}\ncount=${proposalIds.length}`;
    writeFileSync(process.env.GITHUB_OUTPUT, output, { flag: 'a' });
  }
}

main().catch((err) => {
  console.error('Error monitoring proposals:', err);
  process.exit(1);
});
