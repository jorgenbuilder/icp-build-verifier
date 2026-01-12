import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync } from 'fs';

interface ProposalData {
  proposalId: string;
  title: string;
  summary: string;
  url: string;
  commitHash: string | null;
  expectedWasmHash: string | null;
  canisterId: string | null;
}

interface BuildSteps {
  commitHash: string;
  steps: string[];
  wasmOutputPath: string;
}

const EXTRACTION_PROMPT = `You are analyzing an ICP (Internet Computer Protocol) governance proposal to extract build verification instructions.

The proposal describes a canister upgrade. The dfinity/ic repository has ALREADY been cloned and the correct commit has been checked out. You are already in the repository root directory.

Extract ONLY the build commands (no git commands) and the output path. Return as JSON:

{
  "steps": ["build command 1", "build command 2", ...],
  "wasmOutputPath": "path/to/output.wasm"
}

IMPORTANT:
- Do NOT include git clone, git fetch, git checkout, or cd commands
- The repo is already cloned and at the correct commit
- Only include the actual build commands (e.g., bazel build, ./ci/container/build-ic.sh, etc.)
- Return ONLY valid JSON, no markdown code blocks, no explanation

Common build patterns for dfinity/ic:
- Uses Bazel for building
- Canisters are typically built with: bazel build //rs/path/to/canister:canister_name
- Or using the build script: ./ci/container/build-ic.sh -c
- Output is usually in bazel-bin/rs/path/to/canister/ or artifacts/canisters/

Proposal text:
`;

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
    config: {
      temperature: 0.1,
      maxOutputTokens: 1024,
    },
  });

  return response.text || '';
}

function parseGeminiResponse(response: string): { steps: string[]; wasmOutputPath: string } {
  // Try to extract JSON from the response
  let jsonStr = response.trim();

  // Remove markdown code blocks if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed.steps)) {
      throw new Error('Invalid response: steps must be an array');
    }

    return {
      steps: parsed.steps,
      wasmOutputPath: parsed.wasmOutputPath || 'output.wasm'
    };
  } catch (err) {
    console.error('Failed to parse Gemini response:', response);
    throw new Error(`Failed to parse LLM response: ${err}`);
  }
}

async function main() {
  // Read proposal data
  let proposalData: ProposalData;
  try {
    proposalData = JSON.parse(readFileSync('proposal.json', 'utf-8'));
  } catch {
    console.error('Could not read proposal.json. Run fetch-proposal.ts first.');
    process.exit(1);
  }

  if (!proposalData.commitHash) {
    console.error('No commit hash found in proposal. Cannot proceed with build.');
    process.exit(1);
  }

  console.log('Extracting build steps from proposal...');
  console.log(`Title: ${proposalData.title}`);

  const prompt = EXTRACTION_PROMPT + `
Title: ${proposalData.title}
Summary: ${proposalData.summary}
URL: ${proposalData.url}
`;

  const response = await callGemini(prompt);
  console.log('Gemini response received');

  const { steps, wasmOutputPath } = parseGeminiResponse(response);

  console.log(`Extracted ${steps.length} build steps`);
  console.log(`WASM output path: ${wasmOutputPath}`);

  const buildSteps: BuildSteps = {
    commitHash: proposalData.commitHash,
    steps,
    wasmOutputPath,
  };

  writeFileSync('build-steps.json', JSON.stringify(buildSteps, null, 2));
  console.log('Wrote build-steps.json');

  // Also log the steps for visibility in GitHub Actions
  console.log('\nBuild steps:');
  steps.forEach((step, i) => {
    console.log(`  ${i + 1}. ${step}`);
  });
}

main().catch((err) => {
  console.error('Error extracting build steps:', err);
  process.exit(1);
});
