import { readFileSync, writeFileSync } from 'fs';

interface VerifiedProposal {
  status: 'pending' | 'verified' | 'failed' | 'error';
  wasmHashMatch: boolean;
  verifiedAt: string;
  runId?: number;
  actualHash?: string;
  expectedHash?: string;
  errorMessage?: string;
}

interface StateData {
  lastCheckedTimestamp: number;
  proposals: Record<string, VerifiedProposal>;
}

const STATE_FILE = 'state/verified-proposals.json';

export function loadState(): StateData {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { lastCheckedTimestamp: 0, proposals: {} };
  }
}

export function saveState(state: StateData) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function updateProposalState(
  proposalId: string,
  update: Partial<VerifiedProposal>
) {
  const state = loadState();

  state.proposals[proposalId] = {
    ...state.proposals[proposalId],
    ...update,
    verifiedAt: new Date().toISOString(),
  };

  saveState(state);
  return state.proposals[proposalId];
}

// CLI interface for updating state from workflow
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: tsx update-state.ts <proposal_id> <status> [wasmHashMatch] [runId]');
    console.error('  status: pending | verified | failed | error');
    console.error('  wasmHashMatch: true | false');
    process.exit(1);
  }

  const [proposalId, status, wasmHashMatch, runId] = args;

  const update: Partial<VerifiedProposal> = {
    status: status as VerifiedProposal['status'],
  };

  if (wasmHashMatch !== undefined) {
    update.wasmHashMatch = wasmHashMatch === 'true';
  }

  if (runId !== undefined) {
    update.runId = parseInt(runId, 10);
  }

  const result = updateProposalState(proposalId, update);

  console.log(`Updated proposal ${proposalId}:`);
  console.log(JSON.stringify(result, null, 2));
}

// Only run main if this is the entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error('Error updating state:', err);
    process.exit(1);
  });
}
