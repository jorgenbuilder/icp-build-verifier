import { readFileSync, appendFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';

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

interface ProposalData {
  proposalId: string;
  title: string;
  summary: string;
  url: string;
  commitHash: string | null;
  expectedWasmHash: string | null;
}

function computeSha256(filePath: string): string {
  const fileBuffer = readFileSync(filePath);
  const hash = createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
}

function writeGitHubSummary(content: string) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    appendFileSync(summaryFile, content + '\n');
  }
}

function loadState(): StateData {
  const stateFile = 'state/verified-proposals.json';
  try {
    return JSON.parse(readFileSync(stateFile, 'utf-8'));
  } catch {
    return { lastCheckedTimestamp: 0, proposals: {} };
  }
}

function updateProposalState(proposalId: string, update: Partial<VerifiedProposal>) {
  const stateFile = 'state/verified-proposals.json';
  const state = loadState();

  state.proposals[proposalId] = {
    ...state.proposals[proposalId],
    ...update,
    verifiedAt: new Date().toISOString(),
  };

  writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log(`Updated state for proposal ${proposalId}`);
}

async function main() {
  const wasmPath = 'output/canister.wasm';

  // Read proposal data
  let proposalData: ProposalData;
  try {
    proposalData = JSON.parse(readFileSync('proposal.json', 'utf-8'));
  } catch {
    console.error('Could not read proposal.json');
    process.exit(1);
  }

  // Check WASM file exists
  if (!existsSync(wasmPath)) {
    console.error(`WASM file not found at ${wasmPath}`);
    writeGitHubSummary(`## Build Verification Failed

**Proposal:** ${proposalData.proposalId} - ${proposalData.title}

**Error:** WASM file not found after build`);
    process.exit(1);
  }

  // Compute hash of built WASM
  console.log('Computing SHA256 of built WASM...');
  const actualHash = computeSha256(wasmPath);
  const expectedHash = proposalData.expectedWasmHash;

  console.log(`Expected hash: ${expectedHash || 'Not found in proposal'}`);
  console.log(`Actual hash:   ${actualHash}`);

  // Compare
  const match = expectedHash && actualHash.toLowerCase() === expectedHash.toLowerCase();

  // Write GitHub Actions summary
  const statusEmoji = match ? '✅' : (expectedHash ? '❌' : '⚠️');
  const statusText = match ? 'MATCH' : (expectedHash ? 'MISMATCH' : 'CANNOT VERIFY');

  const summary = `## Build Verification Result: ${statusEmoji} ${statusText}

**Proposal ID:** ${proposalData.proposalId}
**Title:** ${proposalData.title}

| Hash Type | Value |
|-----------|-------|
| Expected | \`${expectedHash || 'Not found in proposal'}\` |
| Actual | \`${actualHash}\` |

${match ? '### ✅ Build verification successful!' : ''}
${!match && expectedHash ? '### ❌ Hash mismatch - build does not match expected WASM' : ''}
${!expectedHash ? '### ⚠️ Could not verify - expected hash not found in proposal' : ''}
`;

  console.log('\n' + '='.repeat(60));
  console.log(match ? '✅ VERIFICATION PASSED' : (expectedHash ? '❌ VERIFICATION FAILED' : '⚠️ CANNOT VERIFY'));
  console.log('='.repeat(60));

  writeGitHubSummary(summary);

  // Update state file with verification result
  const runId = process.env.GITHUB_RUN_ID ? parseInt(process.env.GITHUB_RUN_ID, 10) : undefined;

  if (match) {
    updateProposalState(proposalData.proposalId, {
      status: 'verified',
      wasmHashMatch: true,
      actualHash,
      expectedHash: expectedHash || undefined,
      runId,
    });
    process.exit(0);
  } else if (expectedHash) {
    updateProposalState(proposalData.proposalId, {
      status: 'failed',
      wasmHashMatch: false,
      actualHash,
      expectedHash,
      runId,
    });
    process.exit(1); // Mismatch
  } else {
    // No expected hash - warn but don't fail
    updateProposalState(proposalData.proposalId, {
      status: 'error',
      wasmHashMatch: false,
      actualHash,
      errorMessage: 'Expected hash not found in proposal',
      runId,
    });
    console.warn('Warning: Could not verify because expected hash was not found in proposal');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Error comparing hashes:', err);
  process.exit(1);
});
