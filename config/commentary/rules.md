# Proposal Commentary Rules

These rules guide the AI agent when generating commentary on ICP governance proposals.
Proposers and reviewers can modify these rules to customize the analysis behavior.

## Core Principles

1. **Accuracy over completeness**: No commentary is better than fake or misleading commentary.
   If information cannot be verified, explicitly state the uncertainty rather than guessing.

2. **Source everything**: Every claim should be traceable to a source (proposal body, git diff,
   PR discussion, forum post, or documentation).

3. **Relevant changes only**: The IC is a monorepo. Only analyze changes relevant to the
   canister specified in the proposal. Ignore unrelated changes in the same commit range.

## Research Guidelines

### When to perform additional research

- **DO** search GitHub PR discussions for context on why changes were made
- **DO** search the DFINITY forum if the proposal body and PR discussion don't explain
  why a change is necessary *now*, using it as a research tool for additional context
- **DO** browse the NNS Proposal Discussions category (`/c/governance/.../76.json`) when
  forum searching to identify themes, related proposals, or community concerns
- **DO** cite all forum sources in the commentary to help reviewers understand context
- **DO NOT** search the forum if the change is self-evident from:
  - The proposal body
  - The code diff itself
  - The PR discussion on GitHub

### Source priority

1. **Proposal body** - The official description from the proposer
2. **Git diff** - The actual code changes
3. **GitHub PR discussion** - Code review context and rationale
4. **DFINITY Forum** - Community discussion and announcements
5. **Documentation** - Official DFINITY/IC documentation

## Forum API Reference

The DFINITY Forum (Discourse) provides JSON endpoints for programmatic access. Use these as research tools to gather additional context for proposals.

### Available Endpoints

**Searching:**
- Search all topics: `GET https://forum.dfinity.org/search.json?q={query}&page={n}`
  - Query can be proposal ID, keywords, or technical terms
  - Supports pagination with `page` parameter (1-indexed)
  - Example: `search.json?q=139942` finds discussions mentioning proposal 139942

**Accessing Threads:**
- Get thread details: `GET https://forum.dfinity.org/t/{slug}/{id}.json`
  - Returns complete thread with all posts
  - Verify proposal ID in first post for confirmation
  - Example: `/t/proposal-139942-to-upgrade-ii/62423.json`

**Browsing by Category:**
- NNS Proposal Discussions: `GET https://forum.dfinity.org/c/governance/nns-proposal-discussions/76.json`
  - Category ID 76 is dedicated to NNS governance proposals
  - Returns recent topics in chronological order
  - **Often provides valuable context** about current governance themes and related proposals

**Latest Activity:**
- Recent topics: `GET https://forum.dfinity.org/latest.json`
  - Cross-category view of recent forum activity
  - Useful for understanding current community discussions

**Category Directory:**
- All categories: `GET https://forum.dfinity.org/categories.json`
  - Lists all forum categories
  - Generally not needed for proposal analysis

### Authentication

Forum cookies are provided via the `FORUM_COOKIES` environment variable.

**Usage with curl:**
```bash
curl --cookie "$FORUM_COOKIES" -H "Accept: application/json" \
     "https://forum.dfinity.org/search.json?q=139768"
```

**Security**: Never echo or print `FORUM_COOKIES` in logs or output.

### Strategic Forum Research

When forum research is triggered (per Research Guidelines), use this approach to maximize context:

**1. Start with Targeted Search**
- Search for the specific proposal ID
- Filter results to NNS category (category_id: 76)
- Verify proposal ID appears in the thread's first post
- Extract: proposer's explanation, community questions, concerns raised

**2. Browse for Broader Context**
- Check `/c/governance/nns-proposal-discussions/76.json` for related discussions
- Look for patterns:
  - Similar upgrades to the same canister
  - Related proposals in the same time period
  - Recurring issues or initiatives
  - Community themes (e.g., security focus, feature rollouts)

**3. Extract Contextual Value**
- **Why now?** - Timing, urgency, dependencies on other proposals
- **Related work** - Is this part of a broader initiative?
- **Community input** - Has the community raised concerns or provided feedback?
- **Historical context** - Previous similar proposals, patterns over time

**4. Cite All Context**
- Add forum discussions to the `sources` array
- Use source type `forum_post` for threads and category discussions
- Include both specific proposal threads and contextual category browsing
- Helps human reviewers understand where information came from

## Analysis Requirements

### For each proposal, determine:

1. **What changed**: Technical summary of the modifications
2. **Why it changed**: The motivation or problem being solved
3. **Why now**: If discernible, why this change is being proposed at this time
4. **Scope verification**: Confirm only relevant files are being analyzed

### Red flags to note:

- Unexplained changes to security-sensitive code
- Changes that don't match the proposal description
- Missing or insufficient documentation for complex changes
- Changes to multiple unrelated subsystems in a single proposal

## Output Guidelines

- Use clear, technical language appropriate for developers reviewing governance proposals
- Keep summaries concise but complete
- Explicitly note any uncertainties or analysis limitations
- Do not editorialize or provide voting recommendations
- Focus on explaining *what* and *why*, not *whether* to approve

## Customization

Proposers may add canister-specific rules in `config/commentary/canisters/` directory.
For example: `config/commentary/canisters/rrkah-fqaaa-aaaaa-aaaaq-cai.md`
