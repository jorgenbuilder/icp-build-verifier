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
  repoUrl: string;
  steps: string[];
  wasmOutputPath: string;
}

const EXTRACTION_PROMPT = `You are analyzing an ICP (Internet Computer Protocol) governance proposal to extract build verification instructions.

The proposal describes a canister upgrade. Extract the repository URL, build commands, and output path. Return as JSON:

{
  "repoUrl": "https://github.com/org/repo",
  "steps": ["build command 1", "build command 2", ...],
  "wasmOutputPath": "path/to/output.wasm.gz"
}

IMPORTANT:
- repoUrl: The GitHub repository URL mentioned in the proposal (e.g., https://github.com/dfinity/ic or https://github.com/dfinity/dogecoin-canister). If not explicitly mentioned, default to "https://github.com/dfinity/ic"
- steps: ONLY the build commands, NO git commands (clone, fetch, checkout, cd)
- wasmOutputPath: The path to the final WASM file (often ends in .wasm.gz)
- Return ONLY valid JSON, no markdown code blocks, no explanation

Common build patterns:
- dfinity/ic: Uses ./ci/container/build-ic.sh -c, output in artifacts/canisters/
- Other repos: May use ./scripts/docker-build, cargo build, etc.

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

function parseGeminiResponse(response: string): { repoUrl: string; steps: string[]; wasmOutputPath: string } {
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
      repoUrl: parsed.repoUrl || 'https://github.com/dfinity/ic',
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

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  STEP 2: EXTRACT BUILD INSTRUCTIONS VIA LLM');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('TRUST ASSUMPTION: Using Google Gemini to parse the proposal');
  console.log('summary and extract the build commands. The LLM interprets the');
  console.log('human-readable instructions to determine how to build the WASM.');
  console.log('');
  console.log(`Proposal: ${proposalData.title}`);
  console.log(`Commit to build: ${proposalData.commitHash}`);

  const prompt = EXTRACTION_PROMPT + `
Title: ${proposalData.title}
Summary: ${proposalData.summary}
URL: ${proposalData.url}
`;

  const response = await callGemini(prompt);
  console.log('Gemini response received');

  const { repoUrl, steps, wasmOutputPath } = parseGeminiResponse(response);

  console.log('');
  console.log('LLM EXTRACTED BUILD INSTRUCTIONS:');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(`  Repository:      ${repoUrl}`);
  console.log(`  Number of steps: ${steps.length}`);
  console.log(`  WASM output path: ${wasmOutputPath}`);

  const buildSteps: BuildSteps = {
    commitHash: proposalData.commitHash,
    repoUrl,
    steps,
    wasmOutputPath,
  };

  writeFileSync('build-steps.json', JSON.stringify(buildSteps, null, 2));
  console.log('Wrote build-steps.json');

  console.log('');
  console.log('BUILD COMMANDS TO EXECUTE:');
  steps.forEach((step, i) => {
    console.log(`  ${i + 1}. ${step}`);
  });
  console.log('─────────────────────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('Error extracting build steps:', err);
  process.exit(1);
});
