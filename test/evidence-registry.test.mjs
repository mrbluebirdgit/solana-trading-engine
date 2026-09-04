import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseEvidenceRegistry,
  validateEvidenceRegistry,
} from "../src/config/evidence-registry.mjs";

const registryUrl = new URL(
  "../config/evidence-registry.v1.json",
  import.meta.url,
);

test("the evidence registry is internally consistent and remains live-locked", async () => {
  const registry = parseEvidenceRegistry(await readFile(registryUrl, "utf8"));
  const result = validateEvidenceRegistry(registry);

  assert.equal(registry.projectStatus, "LIVE_LOCKED");
  assert.ok(result.sourceCount >= 20);
  assert.ok(result.ruleCount >= 25);
  assert.equal(
    registry.rules.some((rule) => rule.promotionState === "LIVE_CANDIDATE"),
    false,
  );
});

test("unvalidated hypotheses cannot silently become hard gates", async () => {
  const registry = parseEvidenceRegistry(await readFile(registryUrl, "utf8"));

  for (const rule of registry.rules) {
    if (rule.classification === "UNVALIDATED_HYPOTHESIS") {
      assert.notEqual(rule.eligibleUse, "hard_gate");
      assert.equal(rule.requiresLocalCalibration, true);
    }
  }
});

test("rejected shortcuts are forbidden", async () => {
  const registry = parseEvidenceRegistry(await readFile(registryUrl, "utf8"));

  for (const rule of registry.rules) {
    if (rule.classification === "REJECTED_SHORTCUT") {
      assert.equal(rule.eligibleUse, "forbidden");
    }
  }
});

test("validator rejects live candidates while the project is locked", () => {
  const registry = {
    registryVersion: "test",
    projectStatus: "LIVE_LOCKED",
    sources: [
      {
        id: "source",
        title: "Source",
        url: "https://example.com",
        limits: "Test-only source",
      },
    ],
    rules: [
      {
        id: "rule",
        classification: "ENGINEERING_INVARIANT",
        eligibleUse: "hard_gate",
        promotionState: "LIVE_CANDIDATE",
        requiresLocalCalibration: false,
        claim: "Test claim",
        limits: "Test limit",
        sourceIds: ["source"],
      },
    ],
  };

  assert.throws(
    () => validateEvidenceRegistry(registry),
    /cannot be live-eligible/,
  );
});

