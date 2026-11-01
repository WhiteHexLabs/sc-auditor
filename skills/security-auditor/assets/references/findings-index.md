# Findings index (`whitehexlabs.audit-findings-index/v1`)

Load this file only in REPORT, when writing the index. It is not part of MAP, HUNT, ATTACK, or VERIFY.

The finding-lifecycle repository was not readable from this workspace. This is the contract `security-auditor` writes. Cross-skill dedup uses `fingerprint`, `locations`, `title`, and `severity`. Full evidence stays in `evidence_path` and `report_path`.

## Where to write

| Artifact | Path |
|:---------|:-----|
| Index | `findingsIndexPath` from the execution prompt if set. Else `<workDir>/findings-index.json` if `workDir` is set. Always also write `<artifactRoot>/findings-index.json`. |
| Report | `<artifactRoot>/report.md` |
| Log | `<artifactRoot>/audit.log` |

`artifactRoot` is `workDir` when the execution prompt sets it, otherwise `<rootDir>/.sc-auditor-work`.

`run_id`, `target`, and `scope` come from the execution prompt. Use `null` and the resolved `rootDir` / `scopeFiles` when the prompt omits them.

## Index shape

```json
{
  "schema": "whitehexlabs.audit-findings-index/v1",
  "skill": "security-auditor",
  "run_id": "<string or null>",
  "target": "<rootDir or repo>",
  "scope": ["<relative sol path>"],
  "generated_at": "<ISO-8601>",
  "report_path": "<path to report.md>",
  "log_path": "<path to audit.log>",
  "findings": [
    {
      "id": "<hotspot or finding id>",
      "title": "<string>",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW | GAS | INFORMATIONAL",
      "confidence": "Confirmed | Likely | Possible",
      "status": "verified | judge_confirmed | candidate | discarded | invalidated_by_attack",
      "category": "<category>",
      "fingerprint": "<contract>|<function>|<state_vars>|<invariant>|<fix_shape>",
      "locations": [
        { "path": "<file>", "start_line": 1, "end_line": 1, "function": "<name or null>" }
      ],
      "summary": "<one or two sentences>",
      "evidence_path": "<checkpoint json>"
    }
  ]
}
```

Rules:

- Include every finding that reached REPORT, including discarded. Dedup filters on `status`.
- `fingerprint` is the existing cluster key `(contract, function, state_vars, invariant, fix_shape)`. Join with `|`. Use empty segments, not guessed values.
- `summary` is a pointer for the parent. Do not use it as the evidence record.
- `evidence_path` points at the verify checkpoint when it exists, otherwise the attack checkpoint. That file keeps the full description, line ranges, `exploit_sketch`, DA dimensions, and proof notes.
- Do not copy PoC traces, forge logs, or DA essays into the index. Logs stay under `<artifactRoot>/logs/`.
- An audit with no findings writes `"findings": []`.

## Report

`report.md` keeps the five sections: Proved Findings, Confirmed (Unproven), Detected Candidates, Design Tradeoffs, Discarded. Each entry includes the full description, affected lines, evidence sources, exploit sketch, and DA chain. Do not truncate evidence in the report.

## Return note

After the files are written, the chat reply to the parent is at most 1600 characters. No finding bodies, no logs, no source.

```
security-auditor <run_id>
target: <target>
scope_files: <n>
hotspots: <n> attacked, <n> lanes
findings: C=<n> H=<n> M=<n> L=<n> G=<n> I=<n>
status: verified=<n> judge_confirmed=<n> candidate=<n> discarded=<n>
report: <path>
index: <path>
log: <path>
```

Omit a line rather than exceeding 1600 characters. Do not omit `report` or `index`.
