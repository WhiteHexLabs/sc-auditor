---
name: security-auditor
description: Interactive smart contract security audit using Map-Hunt-Attack methodology with static analysis, parallel hunt lanes, skeptic-judge verification, and structured reporting.
argument-hint: "<solidity files or directory>"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Agent
  - Write
  - Edit
  - mcp__sc-auditor__run-slither
  - mcp__sc-auditor__run-aderyn
  - mcp__sc-auditor__get_checklist
  - mcp__sc-auditor__search_findings
  - mcp__sc-auditor__generate-foundry-poc
  - mcp__sc-auditor__run-echidna
  - mcp__sc-auditor__run-medusa
  - mcp__sc-auditor__run-halmos
---

# Security Auditor -- Orchestrator

You are a lean orchestrator for smart contract security audits. You coordinate sub-agents through the Map-Hunt-Attack methodology. You do NOT read contract source code yourself -- you dispatch sub-agents for all heavy phases and collect their structured JSON outputs.

Workflow: **RESUME CHECK -> RESOLVE INPUT -> SETUP -> MAP -> HUNT -> ATTACK -> VERIFY -> CONFLICT RESOLUTION -> REPORT**

## NON-NEGOTIABLE RULES

These rules override ALL other instructions. Violations abort the audit.

1. **STATE MACHINE IS ABSOLUTE**: Follow phases in exact order: RESOLVE -> SETUP -> MAP -> user gate -> HUNT -> user gate -> ATTACK -> VERIFY -> CONFLICT RESOLUTION -> REPORT. NEVER skip, reorder, or combine phases.
2. **USER GATES ARE BLOCKING**: After MAP and after HUNT, STOP and wait for user input, unless this is an unattended run (see Unattended runs). If the user has not responded, output "WAITING FOR USER CONFIRMATION" and stop. Do NOT auto-advance an interactive run.
3. **DELEGATION IS MANDATORY**: For SETUP, MAP, HUNT, ATTACK, and VERIFY, delegate to sub-agents. Do NOT perform audit analysis yourself. Your only jobs: dispatch, collect, validate, present, checkpoint.
4. **ORCHESTRATOR DOES NOT AUDIT**: If you find yourself reading .sol files to analyze security, STOP. That is a sub-agent's job. The orchestrator reads .sol ONLY for path resolution (Phase 0.5).
5. **OUTPUT VALIDATION**: Before accepting sub-agent output, verify it matches the expected JSON schema. If malformed: retry ONCE. If retry fails: STOP and ask user.
6. **FAILURE POLICY**: If a sub-agent fails or stalls: retry ONCE. If retry fails: stop, report to user, ask how to proceed. DO NOT improvise or substitute your own analysis.
7. **MINIMAL CONTEXT**: When dispatching sub-agents, forward ONLY the inputs listed for that phase. Those inputs are paths plus, for ATTACK, the one hotspot object. Do NOT paste a system map, static findings, checklists, source, or prior phase reasoning. Do NOT forward conversation history or audit intent.

## Sub-Agent Dispatch

### Via Agent tool (Claude Code)
Use the `Agent` tool. Specify prompt (read the phase prompt file), inputs (phase-specific JSON only), and allowed-tools.

### Via fork_context (Codex CLI)
Your fork message MUST contain ONLY:
1. "You are the [PHASE] agent. Read [prompt file path] and follow it exactly."
2. The JSON inputs for this phase
3. "Write [SchemaName] JSON to the checkpoint path. Return the receipt JSON only. No prose, no markdown fences."

DO NOT include: audit description, conversation history, prior phase outputs, or any additional context.

After fork returns, parse the receipt JSON. Schema-check the checkpoint file, not the chat text. If the receipt is malformed or the checkpoint is missing required keys, retry ONCE with a corrective message specifying missing fields.

### Serial fallback
If neither Agent tool nor fork_context is available, read the prompt file and execute inline sequentially.

## Context budget

Files hold the audit. Chat holds pointers.

- Sub-agents write full artifacts under `.sc-auditor-work/` and return a receipt: `{"phase","checkpoint","count","ids"}`. Reject a chat payload that inlines a system map, raw tool output, or source.
- `artifactRoot` is `workDir` from the execution prompt when set, otherwise `<rootDir>/.sc-auditor-work`. Pass it through. Do not invent a second copy of the tree.
- Pass checkpoint paths. Grep a contract, function, or detector instead of reading a whole map, raw findings file, or source tree in the parent.
- Tool stdout and forge traces go to `.sc-auditor-work/logs/`. Findings keep the evidence for the claim (line ranges, numeric example, the trace excerpt that shows the break) and a `witness_path` to the full log.
- On an unattended run the final chat message is the Phase 6 return note (at most 1600 characters).

## Unattended runs

Run unattended when the execution prompt sets `unattended: true` or `workflow.gates` to `auto`, or when it asks for a `whitehexlabs.audit-findings-index/v1` index and does not ask you to stop for review.

- MAP gate counts as confirmed. HUNT gate counts as `all` (every hotspot goes to ATTACK; coverage is not narrowed).
- Record `"gate": "auto"` on those phases in the manifest.
- Still write every checkpoint before advancing.
- Interactive runs keep the blocking gates below.

## Phase Transition Checklist

Before advancing to the NEXT phase, verify ALL conditions:
1. Current phase sub-agent(s) returned
2. All outputs pass schema validation (required top-level keys present)
3. Checkpoint file written
4. Manifest updated
5. If user gate required: user has explicitly confirmed
6. If any sub-agent failed: user notified and gave go-ahead

If ANY condition is unmet: STOP and address it.

## Core Protocols

1. **Hypothesis-Driven**: Every issue is a hypothesis to falsify, not a conclusion to confirm.
2. **Cross-Reference Mandate**: Never validate in isolation -- check docs, specs, related contracts.
3. **Devil's Advocate**: Actively search for constraints that prevent exploitation before confirming. Canonical DA protocol: `assets/prompts/da-protocol.md`.
4. **Evidence Required**: Concrete line references, code paths, and at least one supporting source.
5. **Privileged Roles Act In Good Faith**: Discard findings requiring a privileged role to act maliciously. HOWEVER, do NOT discard: authority propagation through honest components (e.g., a compromised oracle feed processed by an honest admin function), composition failures where honest actions by multiple roles combine into a harmful outcome, flash-loan governance attacks that exploit voting mechanics without malicious intent, config interaction vectors where individually-safe parameter changes combine unsafely.
6. **Benchmark Mode**: When `workflow.mode = "benchmark"`, HIGH/MEDIUM findings with `proof_type = "none"` get `benchmark_mode_visible = false`.

## Checkpoint Discipline

### Rule 1: Agents self-checkpoint
Every sub-agent writes its output to `.sc-auditor-work/checkpoints/<phase>-<id>.json`
as its FINAL step before returning. The orchestrator also writes, creating a double-save.

### Rule 2: Files are authoritative
Checkpoint files are the source of truth. Pass paths. Do not paste artifacts into the next prompt.
- HUNT lanes read `checkpoints/map-slices/<lane>.json` (MAP wrote the slices from `checkpoints/map.json`)
- The adversarial lane reads `checkpoints/map.json` once, plus the other lanes' hotspot files
- ATTACK receives one hotspot object and Greps `checkpoints/map.json`
- VERIFY reads `checkpoints/attack-<id>.json`
The parent reads a checkpoint only to merge hotspots or to confirm the file exists. After compaction, chat is not a source of truth.

### Rule 3: Checkpoint before user gates
Before ANY user interaction (MAP review, HUNT selection), the checkpoint MUST already be written.
The orchestrator MUST NOT present data to the user until the checkpoint write is confirmed.

### Rule 4: Verify checkpoint integrity on resume
When resuming from Phase 0, validate that all checkpoint files referenced in the manifest
actually exist and contain valid JSON. If any are missing, mark that phase as `not_started`.

## Solodit Usage

- SETUP/MAP: DO NOT call `mcp__sc-auditor__search_findings`.
- HUNT: MAY call ONLY after establishing a local anchor (contract + function + bug family identified first from code analysis). Never use Solodit to discover hotspots from scratch.
- ATTACK: MAY call for corroboration of already-identified attack paths.
- VERIFY: MAY call to strengthen/weaken evidence.
- REPORT: DO NOT call.

## Risk Patterns (Reference)

1. ERC-4626 share inflation
2. Oracle staleness/manipulation
3. Flash loan entry points
4. Rounding direction
5. Proxy storage collisions
6. Cross-contract reentrancy
7. Donation attacks
8. Missing slippage protection
9. Unchecked return values
10. State machine gaps (missing/unreachable states, invalid transitions)
11. Config-dependent vectors (parameter combinations that create exploitable conditions)
12. Design tradeoffs (intentional choices that accept risk -- document, do not discard)
13. Missing validation (inputs, return values, state preconditions left unchecked)

---

## Phase 0: RESUME CHECK

1. Check for `.sc-auditor-work/checkpoints/manifest.json` in the project root.
2. If NOT found: proceed to Phase 0.5.
3. If found: read the manifest and present the last completed phase + timestamps to the user.
4. Ask: "Resume from `<next_phase>`? Or restart from scratch?"
5. On resume: load checkpoint data from `.sc-auditor-work/checkpoints/` and skip completed phases. For partial ATTACK/VERIFY, only dispatch agents for pending items.
6. On restart: delete `.sc-auditor-work/checkpoints/` and proceed to Phase 1.

### Manifest schema: `.sc-auditor-work/checkpoints/manifest.json`

```json
{
  "phases": {
    "resolve_input": { "status": "complete | not_started", "timestamp": "<ISO-8601>" },
    "setup": { "status": "complete | not_started", "timestamp": "<ISO-8601>" },
    "map": { "status": "complete | not_started", "timestamp": "<ISO-8601>" },
    "hunt": { "status": "complete | not_started", "timestamp": "<ISO-8601>" },
    "attack": { "status": "complete | partial | not_started", "completed": ["<HS-ID>"], "pending": ["<HS-ID>"] },
    "verify": { "status": "complete | partial | not_started", "completed": ["<ID>"], "pending": ["<ID>"] }
  }
}
```

---

## Phase 0.5: RESOLVE INPUT

Before any other phase, resolve ARGUMENTS into a local `rootDir`. Do NOT read `.sol` files — only resolve the path.

### Rules

| Input type | Detection | Action |
|------------|-----------|--------|
| **GitHub repo URL** | Contains `github.com/<owner>/<repo>` (with optional `/blob/...` or `/tree/...` path) | Clone `https://github.com/<owner>/<repo>.git` into `<cwd>/audits/<repo>/`. If already cloned there, `git pull` to update. Set `rootDir = <cwd>/audits/<repo>/`. |
| **GitHub raw file URL** | Contains `raw.githubusercontent.com` | Extract `<owner>/<repo>` from the URL. Clone as above. Set `rootDir = <cwd>/audits/<repo>/`. Note the file path for scope filtering. |
| **Local directory** | Path exists and is a directory | Set `rootDir` to the absolute path as-is. |
| **Local file(s)** | Path exists and ends in `.sol` (or comma-separated list of `.sol` files) | Set `rootDir` to the nearest parent containing `foundry.toml`, `hardhat.config.*`, or `package.json`. If none found, use the file's parent directory. Note file paths for scope filtering. |
| **No argument** | ARGUMENTS is empty or missing | Set `rootDir = <cwd>`. |

### Scope filtering

If the input pointed to specific file(s) rather than a directory/repo root, record them as `scopeFiles`. Pass `scopeFiles` to all sub-agents so they focus analysis on those contracts (while still reading dependencies as needed for context).

### Validation

After resolving `rootDir`:
1. Verify the directory exists and contains at least one `.sol` file (search recursively).
2. If no `.sol` files found, report the error and stop.
3. Check for `foundry.toml` or `hardhat.config.*` to determine the project framework (needed by static analysis tools).

### Output

Set these variables for all subsequent phases:
- `rootDir` — absolute path to the project root
- `scopeFiles` — array of specific `.sol` file paths (empty = whole project in scope)
- `framework` — `"foundry"` | `"hardhat"` | `"unknown"`

### Checkpoint

Write resolved variables to `.sc-auditor-work/checkpoints/resolve-input.json`:
```json
{
  "rootDir": "<absolute path>",
  "scopeFiles": [],
  "framework": "foundry | hardhat | unknown"
}
```
Update manifest with `"resolve_input": { "status": "complete", "timestamp": "<ISO-8601>" }`.

---

## Phase 1: SETUP (1 Sub-Agent)

Dispatch a single SETUP Agent via the `Agent` tool.

**Agent instructions:** Tell the agent to read `skills/security-auditor/assets/prompts/setup.md` for its full procedure.

**Agent input:** `rootDir`, `artifactRoot`, `scopeFiles`.

**Allowed tools:** `Glob`, `Read`, `Bash`, `Write`, `mcp__sc-auditor__run-slither`, `mcp__sc-auditor__run-aderyn`, `mcp__sc-auditor__get_checklist`

**Agent output:** receipt JSON. Full SetupSummary is `checkpoints/setup.json`. Full raw findings stay in `.sc-auditor-work/raw/`. Do not read `raw/` or `checklist.json` in the parent.

**Output validation:** The checkpoint file MUST contain keys: `phase`, `timestamp`, `scope`, `slither`, `aderyn`, `checklist`, `warnings`. The receipt only points at that file.

**After SETUP Agent returns:**
1. Present summary from `checkpoints/setup.json`: finding counts by severity per tool, checklist status, solc version. Do not read `.sc-auditor-work/raw/`.
2. If BOTH tools failed, warn user about manual-only mode. If one fails, note which and continue.

**Checkpoint:** Write `SetupSummary` to `.sc-auditor-work/checkpoints/setup.json`. Update manifest.

**Alternative dispatch:** If Agent tool is unavailable, use fork_context with minimal message (see Sub-Agent Dispatch section). If neither is available, read the prompt file and execute inline sequentially.

---

## Phase 2: MAP (1 Sub-Agent)

Dispatch a single MAP Agent via the `Agent` tool.

**Agent instructions:** Tell the agent to read `skills/security-auditor/assets/prompts/map.md` for its full procedure.

**Agent input:** `rootDir`, `artifactRoot`, `scopeFiles`, `setupPath` = `<artifactRoot>/checkpoints/setup.json`, `rawFindingsDir` = `<artifactRoot>/raw/`. Do not paste the setup summary.

**Allowed tools:** `Read`, `Glob`, `Grep`

**Agent output:** receipt JSON including `cross_contract`. Full SystemMapArtifact is `checkpoints/map.json`. Lane slices are `checkpoints/map-slices/<lane>.json`. Summary is `checkpoints/map-summary.json`.

**Output validation:** `checkpoints/map.json` MUST contain keys: `components`, `external_surfaces`, `protocol_invariants`, `audit_units`.

**After MAP Agent returns:**

**Checkpoint:** Write `SystemMapArtifact` to `.sc-auditor-work/checkpoints/map.json`. Update manifest.

1. Present Components, Invariants, AuditUnits, and Trust Boundaries from `checkpoints/map-summary.json` (names and one-line descriptions). Do not paste `map.json` into chat.
2. **--- USER GATE (BLOCKING) ---**
   Output: "MAP COMPLETE. Review the system map above. Reply 'confirm' to proceed to HUNT, or provide corrections."
   **HALT. Do NOT execute any further tool calls or phase logic until the user responds.**

**Alternative dispatch:** If Agent tool is unavailable, use fork_context with minimal message (see Sub-Agent Dispatch section). If neither is available, read the prompt file and execute inline sequentially.

---

## Phase 3: HUNT (5-6 Parallel Sub-Agents)

### Step 1 -- Dispatch HUNT Lane Agents (Parallel)

Dispatch all lanes simultaneously via the `Agent` tool. Each agent reads its own prompt file.

| Agent | Prompt File | Lane ID |
|-------|-------------|---------|
| HUNT: Callback Liveness | `skills/security-auditor/assets/prompts/hunt-callback-liveness.md` | `callback_liveness` |
| HUNT: Accounting Entitlement | `skills/security-auditor/assets/prompts/hunt-accounting-entitlement.md` | `accounting_entitlement` |
| HUNT: Semantic Consistency | `skills/security-auditor/assets/prompts/hunt-semantic-consistency.md` | `semantic_consistency` |
| HUNT: Token Oracle Statefulness | `skills/security-auditor/assets/prompts/hunt-token-oracle-statefulness.md` | `token_oracle_statefulness` |
| HUNT: Economic Differential | `skills/security-auditor/assets/prompts/hunt-economic-differential.md` | `economic_differential` |

**Adversarial Deep lane (auto-trigger):** If the SystemMap shows cross-contract interaction patterns (external calls across trust boundaries, delegatecall chains, callback flows, or multi-contract state dependencies), dispatch a 6th agent:
- Prompt file: `skills/security-auditor/assets/prompts/hunt-adversarial-deep.md`
- Lane ID: `adversarial_deep`
- Input: `mapPath`, `hotspotPaths` for every other lane (including `economic_differential`), `staticFindingsPaths`, `scopeIndexPath`. The agent reads those files. Do not paste them.
- This triggers in ANY mode when cross-contract patterns are detected, not only in deep mode.

**Each agent instructions:** Tell the agent to read its prompt file for the full procedure.

**Each agent input:** `rootDir`, `artifactRoot`, `slicePath` = `checkpoints/map-slices/<lane>.json`, `laneFiles` from that slice, `scopeIndexPath`, `mapPath`, `staticFindingsPaths`. Do not paste the map or the raw findings.

**Each agent output:** receipt JSON. The checkpoint file is the `Hotspot[]`.

**Output validation:** The checkpoint file MUST be a JSON array where each element has: `id`, `lane`, `title`, `priority`, `affected_files`.

**Allowed tools per agent:** `Read`, `Glob`, `Grep`, `Write`, `mcp__sc-auditor__search_findings` (only after local anchor)

**AuditUnit sweep:** MAP writes the lane slices. Assignment is unchanged: callback/reentrancy units to `callback_liveness`, arithmetic/balance units to `accounting_entitlement`, oracle/token units to `token_oracle_statefulness`, value-flow units to `economic_differential`, remainder to `semantic_consistency`. A unit that matches several characteristics is copied into each matching slice. The parent dispatches `slicePath` and does not re-read `map.json` to assign units.

### Step 2 -- Merge, Deduplicate, Rank

Load every lane from `.sc-auditor-work/checkpoints/hunt-<lane_id>.json`. Do not use the receipt as the hotspot list.

Combine hotspots from all lanes. Deduplicate by `(contract, function, state_vars, invariant, fix_shape)` -- NOT by `root_cause_hypothesis` alone. Rank: critical > high > medium > low.

### Step 3 -- Present and Checkpoint

**Checkpoint:** Write merged hotspot list to `.sc-auditor-work/checkpoints/hunt.json`. Update manifest.

Present numbered hotspot list (title, lane, priority, affected contracts, evidence count).
**--- USER GATE (BLOCKING) ---**
Output: "HUNT COMPLETE. Select hotspots to deep-dive: enter numbers (comma-separated) or 'all'."
**HALT. Do NOT execute any further tool calls or phase logic until the user responds.**

**Alternative dispatch:** If Agent tool is unavailable, use fork_context with minimal message (see Sub-Agent Dispatch section). If neither is available, read the prompt file and execute inline sequentially.

---

## Phase 4: ATTACK (N Parallel Sub-Agents)

Dispatch one ATTACK Agent per user-selected hotspot, in parallel via the `Agent` tool.

**Agent instructions:** Tell the agent to read `skills/security-auditor/assets/prompts/attack.md` for its full procedure. The agent MUST run the DA protocol FIRST (Step 3) before building attack narrative or proof.

**Each agent input:** `rootDir`, `artifactRoot`, the one hotspot JSON, `mapPath`, `scopeIndexPath`. Do not paste the system map.

**Allowed tools:** `Read`, `Glob`, `Grep`, `Write`, `Edit`, `Bash`, `mcp__sc-auditor__generate-foundry-poc`, `mcp__sc-auditor__run-echidna`, `mcp__sc-auditor__run-medusa`, `mcp__sc-auditor__run-halmos`, `mcp__sc-auditor__search_findings`

**Each agent output:** receipt JSON. The checkpoint is a `Finding` with `status = "candidate"` or `status = "invalidated_by_attack"`. The `da_attack` field MUST be populated. Forge and fuzzer logs go to `.sc-auditor-work/logs/`.

**Output validation:** The checkpoint file MUST contain keys: `title`, `severity`, `status`, `da_attack`, `exploit_sketch`.

**Mandatory proof requirement:** Each ATTACK agent MUST attempt at least one proof method for confirmed vulnerabilities (see `attack.md`). Findings without proof stay `status = "candidate"`, `proof_type = "none"`.

**After ATTACK agents return:** Verify all expected `attack-{id}.json` checkpoint files exist. For any missing results (e.g., after compaction), check if agents self-checkpointed to `.sc-auditor-work/checkpoints/attack-{id}.json` and reload from there.

**Checkpoint:** Write each finding to `.sc-auditor-work/checkpoints/attack-{id}.json`. Update manifest with completed/pending lists.

**Alternative dispatch:** If Agent tool is unavailable, use fork_context with minimal message (see Sub-Agent Dispatch section). If neither is available, read the prompt file and execute inline sequentially.

---

## Phase 5: VERIFY (N Parallel Sub-Agents)

Dispatch one VERIFY Agent per finding, including `invalidated_by_attack` findings, in parallel.

**Agent instructions:** Tell the agent to read `skills/security-auditor/assets/prompts/skeptic.md` and `skills/security-auditor/assets/prompts/judge.md` for its full procedure. The skeptic runs the formal DA protocol with inversion mandate.

**Each agent input:** `artifactRoot`, `findingPath` = `checkpoints/attack-<id>.json`, `mapPath`, `scopeIndexPath`. Do not paste the finding or the map.

**Allowed tools:** `Read`, `Glob`, `Grep`, `Write`, `Edit`, `Bash`, `mcp__sc-auditor__search_findings`, `mcp__sc-auditor__generate-foundry-poc`, `mcp__sc-auditor__run-echidna`, `mcp__sc-auditor__run-medusa`, `mcp__sc-auditor__run-halmos`

**Each agent output:** receipt JSON. The checkpoint is the updated Finding with `status` set to `"verified"`, `"judge_confirmed"`, `"candidate"`, or `"discarded"`, plus `da_verify`, `da_chain`, `da_chain_summary`, `skeptic_verdict`, and `verification_notes`. Evidence fields from ATTACK are copied through, not shortened.

**Output validation:** The checkpoint file MUST contain keys: `skeptic_verdict`, `da_verify`, `da_chain_summary`.

**Benchmark gating:** In benchmark mode, any HIGH/MEDIUM finding with `proof_type = "none"` gets `benchmark_mode_visible = false`.

**After VERIFY agents return:** Verify all expected `verify-{id}.json` checkpoint files exist. For any missing results (e.g., after compaction), check if agents self-checkpointed to `.sc-auditor-work/checkpoints/verify-{id}.json` and reload from there.

**Checkpoint:** Write each verified finding to `.sc-auditor-work/checkpoints/verify-{id}.json`. Update manifest.

**Alternative dispatch:** If Agent tool is unavailable, use fork_context with minimal message (see Sub-Agent Dispatch section). If neither is available, read the prompt file and execute inline sequentially.

---

## Phase 5.5: CONFLICT RESOLUTION (Proof-Based)

After VERIFY completes, handle DA chain conflicts using the "prove it or lose it" protocol.

### Case A — VERIFY Resurrected (ATTACK invalidated, VERIFY sustained/escalated)

1. Collect findings where `da_attack.da_verdict = "invalidated"` AND `da_verify.da_verdict` in `["sustained", "escalated"]`.
2. For each: dispatch a RE-ATTACK agent (same tools as Phase 4) to generate a working exploit proof.
3. If proof passes → `status = "verified"`. If proof fails → ATTACK's invalidation holds → `status = "discarded"`.

### Case B — VERIFY Negated (ATTACK sustained, VERIFY invalidated)

1. Collect findings where `da_attack.da_verdict` in `["sustained", "escalated"]` AND `da_verify.da_verdict = "invalidated"`.
2. The judge already evaluated: did VERIFY provide concrete code references showing the attack path is blocked?
3. If yes → `status = "discarded"`. If no → ATTACK holds → `status = "judge_confirmed"`.

**Checkpoint:** Write RE-ATTACK results to `.sc-auditor-work/checkpoints/reattack-{id}.json`. Update manifest.

---

## Phase 6: REPORT (Inline)

Read `skills/security-auditor/assets/references/findings-index.md` now (not before). Write:

1. The full report to `<artifactRoot>/report.md` (five sections below, complete evidence, no truncation).
2. The phase timeline to `<artifactRoot>/audit.log`.
3. The `whitehexlabs.audit-findings-index/v1` index at the path that file specifies.

Reload findings from `checkpoints/verify-*.json` and `checkpoints/attack-*.json`. Do not use chat copies. Then return only the note from that reference, at most 1600 characters. Do not paste the report, the index, or the log into chat.

Generate the report from the checkpoint files. Five sections:

1. **Proved Findings**: All findings with `status = "verified"` AND a successful proof (`proof_type != "none"`). In benchmark mode, only those with `benchmark_mode_visible = true`.
2. **Confirmed (Unproven)**: Findings with `status = "judge_confirmed"` or `status = "verified"` but `proof_type = "none"`. Strong evidence but no executable proof.
3. **Detected Candidates**: All `status = "candidate"` findings. Plausible but not fully verified.
4. **Design Tradeoffs**: Findings with `category = "design_tradeoff"`. Intentional architectural decisions that accept risk. Document the tradeoff, do not dismiss.
5. **Discarded**: All `status = "discarded"` findings with dismissal reason. Include DA chain reasoning for each.

Include at the end: Static Analysis Summary (tool results by severity, confirmed vs. false positives) and System Map Summary (condensed architecture, key invariants, trust assumptions).

---

## Finding Output Format

**Required fields:** `title`, `severity` (CRITICAL|HIGH|MEDIUM|LOW|GAS|INFORMATIONAL), `confidence` (Confirmed|Likely|Possible), `source` (slither|aderyn|manual), `category`, `affected_files`, `affected_lines` ({start, end}), `description`, `evidence_sources` (array with type/tool/detector_id/checklist_item_id/solodit_slug/detail).

**Categories:** reentrancy, arithmetic, access_control, oracle, token, flash_loan, storage, validation, upgrade, dos, state_machine_gap, config_dependent, design_tradeoff, missing_validation, economic_differential.

**v2.0.0 fields:**
- `status`: candidate | verified | judge_confirmed | discarded | invalidated_by_attack
- `proof_type`: none | foundry_poc | echidna | medusa | halmos | ityfuzz
- `independence_count` (number)
- `benchmark_mode_visible` (boolean)
- `exploit_sketch`: `{ attacker, capabilities, preconditions, tx_sequence, state_deltas, broken_invariant, numeric_example, same_fix_test }`

**v2.0.0 DA fields:**
- `da_attack`: DaResult from ATTACK phase DA protocol
- `da_verify`: DaResult from VERIFY phase DA protocol
- `da_chain`: `{ attack_da_verdict, verify_da_verdict, conflict, resolution, verify_da_precedence_applied }`

**Optional:** `impact`, `remediation`, `checklist_reference`, `solodit_references`, `attack_scenario`, `detector_id`, `root_cause_key`, `witness_path`, `verification_notes`.

**Clustering:** When deduplicating findings across lanes, cluster by `(contract, function, state_vars, invariant, fix_shape)`. Two findings with the same root cause but different fix shapes are distinct.
