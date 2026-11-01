import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SKILL = resolve(ROOT, "skills/security-auditor/SKILL.md");
const PROMPTS = resolve(ROOT, "skills/security-auditor/assets/prompts");
const INDEX = resolve(ROOT, "skills/security-auditor/assets/references/findings-index.md");

const PHASE_PROMPTS = [
  "setup.md",
  "map.md",
  "attack.md",
  "skeptic.md",
  "judge.md",
  "hunt-callback-liveness.md",
  "hunt-accounting-entitlement.md",
  "hunt-semantic-consistency.md",
  "hunt-token-oracle-statefulness.md",
  "hunt-economic-differential.md",
  "hunt-adversarial-deep.md",
];

function read(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("AC52: unattended handoff stays small", () => {
  it("SKILL.md names the findings-index schema and the 1600-character return cap", () => {
    const body = read(SKILL);
    expect(body).toContain("whitehexlabs.audit-findings-index/v1");
    expect(body).toContain("1600");
    expect(body).toContain("findings-index.md");
  });

  it("SKILL.md dispatches lane slices instead of a pasted system map", () => {
    const body = read(SKILL);
    expect(body).toContain("map-slices");
    expect(body).not.toContain("SystemMapArtifact JSON, static findings JSON");
    expect(body).toContain("Do not paste the map or the raw findings");
  });

  it("findings-index reference keeps evidence paths and does not replace the report", () => {
    const body = read(INDEX);
    expect(body).toContain("whitehexlabs.audit-findings-index/v1");
    expect(body).toContain("evidence_path");
    expect(body).toContain("fingerprint");
    expect(body).toContain("Do not truncate evidence");
  });
});

describe("AC53: workers write artifacts and return receipts", () => {
  for (const file of PHASE_PROMPTS) {
    it(`${file} tells the worker to return a receipt and keep evidence in the checkpoint`, () => {
      const body = read(resolve(PROMPTS, file));
      expect(body).toMatch(/receipt/i);
      expect(body).toMatch(/## Output Format/);
      expect(body).toMatch(/## Scope Constraint/);
    });
  }

  it("da-protocol stays the embedded DA spec, not a receipt", () => {
    const body = read(resolve(PROMPTS, "da-protocol.md"));
    expect(body).not.toMatch(/receipt/i);
    expect(body).toMatch(/## Output Format/);
  });

  it("worked examples that duplicate the schema are not in the phase prompts", () => {
    for (const file of ["map.md", ...PHASE_PROMPTS.filter((f) => f.startsWith("hunt-"))]) {
      const body = read(resolve(PROMPTS, file));
      expect(body, file).not.toContain("## Output Example");
    }
  });

  it("attack logs stay on disk", () => {
    const body = read(resolve(PROMPTS, "attack.md"));
    expect(body).toContain("logs/attack-");
    expect(body).toContain("witness_path");
  });

  it("hunt lanes read a slice or, for adversarial, the map file once", () => {
    for (const file of PHASE_PROMPTS.filter((f) => f.startsWith("hunt-") && f !== "hunt-adversarial-deep.md")) {
      const body = read(resolve(PROMPTS, file));
      expect(body, file).toContain("slicePath");
      expect(body, file).toContain("Do not Glob the tree");
    }
    const deep = read(resolve(PROMPTS, "hunt-adversarial-deep.md"));
    expect(deep).toContain("hotspotPaths");
    expect(deep).toContain("economic_differential");
    expect(deep).toContain("Do not read the rest of the tree");
  });
});
