# Findings index (`whitehexlabs.audit-findings-index/v1`)

Load this file only in REPORT, after the primary report is written. Extract the index from that report in the same context. The merge stage reads this file and does not re-read the report.

The orchestrator validator accepts YAML only. Write `findings-index.yaml`. Do not write a JSON index. A native `findings.json` is not this index: the orchestrator leaves the finding count unknown when the only artifact is JSON.

## Where to write

| Artifact | Path |
|:---------|:-----|
| Index | `<artifactRoot>/findings-index.yaml`. If the execution prompt sets `findingsIndexPath`, write that path instead. One file. |
| Report | `<artifactRoot>/report.md` (this is artifact id `primary-report`) |
| Log | `<artifactRoot>/audit.log` |

`artifactRoot` is `workDir` when the execution prompt sets it, otherwise `<rootDir>/.sc-auditor-work`.

## When to write nothing

Write no index file when any of these are true:

- The execution prompt has no `run_id` or no `step`. Do not invent them. `null` does not match.
- A finding in the indexed sections is missing `root_cause`, `mechanism`, `locations`, `preconditions`, or `impact`, and the report does not state that field. Do not guess. Do not emit a partial list.
- You cannot point every indexed finding at a heading that exists in `report.md`.

Say so in the return note: `index: none; findings count unknown` plus the reason. An omitted index means the count is unknown, not zero.

An empty `findings` list is valid only when the report itself states zero findings in the four indexed sections, and `coverage.limitations` records why (including how many discarded hypotheses were left out).

Do not drop findings from the list to save space. A long index is valid.

## Top-level keys

Exactly these five keys: `schema`, `run_id`, `step`, `coverage`, `findings`. Any other top-level key is rejected (`skill`, `target`, `fingerprint`, `report_path`, and `dedup` included):

```yaml
schema: whitehexlabs.audit-findings-index/v1
run_id: <copied from the execution prompt>
step: <integer copied from the execution prompt>
coverage:
  summary: >-
    What this step reviewed and how. Declaration, not a measured ratio.
  limitations:
    - "concrete gap, or [] only when there is none"
findings: []
```

`coverage.summary` is required. `coverage.limitations` is a list.

`run_id` and `step` must equal the execution prompt. A mismatched `run_id` or `step` is rejected.

## Findings

Index every entry in these report sections, in that order: Proved Findings, Confirmed (Unproven), Detected Candidates, Design Tradeoffs. Do not index Discarded. Give each indexed entry a heading `### local-001: <title>` (increment the number). The heading text is the evidence locator.

```yaml
findings:
  - id: local-001
    original_finding_id: HS-014   # this skill's id, or null
    title: "Donation-based share-price inflation"
    root_cause: "unprotected initial share-price formation"
    mechanism: "donate assets before the first deposit to inflate the rate"
    locations:
      - src/Vault.sol:42
      - src/Vault.sol:40-88
    preconditions:
      - "vault holds zero or few shares"
    impact: "later depositors' funds can be skimmed by the first depositor"
    requires_privileged_actor: unknown
    severity_hint: HIGH
    evidence:
      - artifact_id: primary-report
        locator: "section 'local-001: Donation-based share-price inflation'; witness .sc-auditor-work/logs/attack-HS-014.log"
```

| Field | Rule |
|:------|:-----|
| `id` | Unique in this file. `local-001`, `local-002`, … |
| `original_finding_id` | This skill's hotspot or finding id, or `null`. |
| `title` | Report title. |
| `root_cause` | Cause, not a repeat of the title. |
| `mechanism` | How the attack or tradeoff works. |
| `locations` | Non-empty list of `path:line` or `path:start-end` strings. |
| `preconditions` | List of strings copied from the report. |
| `impact` | Consequence copied from the report. |
| `requires_privileged_actor` | Unquoted YAML `true`, `false`, or `unknown`. Never omit. |
| `severity_hint` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `GAS`, `INFORMATIONAL`, or `null`. Advisory. |
| `evidence` | Non-empty. Each item is `artifact_id: primary-report` plus a `locator`. |

`requires_privileged_actor`: `unknown` is not `false`. Use `false` only when the report shows an unprivileged actor. Use `true` only when the report shows a privileged role is required and the finding is still reported (authority propagation, composition, config interaction, design tradeoff). Otherwise `unknown`. The quoted strings `"true"` and `"false"` are rejected; write the bare YAML booleans.

`evidence` may cite only `primary-report`. Put witness logs, PoC paths, and line ranges in the `locator` text. A second item with another `artifact_id` is rejected.

Do not truncate evidence in `report.md`. The index points at it.

## Report

`report.md` keeps the five sections: Proved Findings, Confirmed (Unproven), Detected Candidates, Design Tradeoffs, Discarded. Each indexed finding's heading is `### local-NNN: <title>` and the body keeps the full description, affected lines, evidence sources, exploit sketch, and DA chain. If the four indexed sections are empty, the report states that there are zero findings.

## Return note

At most 1600 characters. No finding bodies, no logs, no source.

When the index was written:

```
security-auditor <run_id> step <step>
target: <target>
scope_files: <n>
hotspots: <n> attacked, <n> lanes
indexed_findings: <n>
report: <path>
index: <path>
log: <path>
```

When it was not written, do not invent a count:

```
security-auditor <run_id> step <step>
index: none; findings count unknown
reason: <one line>
report: <path>
log: <path>
```

Keep `report`. Include `index` only when the YAML file exists.
