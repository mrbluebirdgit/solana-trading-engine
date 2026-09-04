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

async function readRegistryFixture() {
  return JSON.parse(await readFile(registryUrl, "utf8"));
}

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
  assert.equal(Object.isFrozen(registry.rules), true);
  assert.equal(Object.isFrozen(registry.rules[0]), true);
  assert.throws(() => {
    registry.rules[0].promotionState = "LIVE_CANDIDATE";
  }, TypeError);
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
    registryVersion: "1.0.0",
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

test("validator requires local calibration for unvalidated hypotheses", () => {
  const registry = {
    registryVersion: "1.0.0",
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
        classification: "UNVALIDATED_HYPOTHESIS",
        eligibleUse: "paper_filter_only",
        promotionState: "RESEARCH_ONLY",
        requiresLocalCalibration: false,
        claim: "Test claim",
        limits: "Test limit",
        sourceIds: ["source"],
      },
    ],
  };

  assert.throws(
    () => validateEvidenceRegistry(registry),
    /must require local calibration/,
  );
});

test("validator requires the pinned evidence-registry schema version", async () => {
  const registry = await readRegistryFixture();
  registry.registryVersion = "1.0.1";

  assert.throws(
    () => validateEvidenceRegistry(registry),
    /version must be 1\.0\.0/,
  );
});

test("validator enforces empirical-feature use and calibration", async () => {
  const wrongUse = await readRegistryFixture();
  const wrongUseRule = wrongUse.rules.find(
    (rule) => rule.classification === "EMPIRICAL_FEATURE",
  );
  wrongUseRule.eligibleUse = "hard_gate";

  assert.throws(
    () => validateEvidenceRegistry(wrongUse),
    /EMPIRICAL_FEATURE cannot use hard_gate/,
  );

  const missingCalibration = await readRegistryFixture();
  const missingCalibrationRule = missingCalibration.rules.find(
    (rule) => rule.classification === "EMPIRICAL_FEATURE",
  );
  missingCalibrationRule.requiresLocalCalibration = false;

  assert.throws(
    () => validateEvidenceRegistry(missingCalibration),
    /EMPIRICAL_FEATURE must require local calibration/,
  );
});

test("validator confines hypotheses and rejected shortcuts to research", async () => {
  const promotedHypothesis = await readRegistryFixture();
  const hypothesis = promotedHypothesis.rules.find(
    (rule) => rule.classification === "UNVALIDATED_HYPOTHESIS",
  );
  hypothesis.promotionState = "PAPER_ONLY";

  assert.throws(
    () => validateEvidenceRegistry(promotedHypothesis),
    /UNVALIDATED_HYPOTHESIS cannot be PAPER_ONLY/,
  );

  const executableShortcut = await readRegistryFixture();
  const shortcut = executableShortcut.rules.find(
    (rule) => rule.classification === "REJECTED_SHORTCUT",
  );
  shortcut.eligibleUse = "feature_only";

  assert.throws(
    () => validateEvidenceRegistry(executableShortcut),
    /REJECTED_SHORTCUT cannot use feature_only/,
  );

  const promotedShortcut = await readRegistryFixture();
  promotedShortcut.rules.find(
    (rule) => rule.classification === "REJECTED_SHORTCUT",
  ).promotionState = "PAPER_ONLY";

  assert.throws(
    () => validateEvidenceRegistry(promotedShortcut),
    /REJECTED_SHORTCUT cannot be PAPER_ONLY/,
  );
});

test("validator keeps engineering and risk controls in their hard-gate lanes", async () => {
  const engineeringAsFeature = await readRegistryFixture();
  engineeringAsFeature.rules.find(
    (rule) => rule.classification === "ENGINEERING_INVARIANT",
  ).eligibleUse = "feature_only";

  assert.throws(
    () => validateEvidenceRegistry(engineeringAsFeature),
    /ENGINEERING_INVARIANT cannot use feature_only/,
  );

  const riskAsPaperFilter = await readRegistryFixture();
  riskAsPaperFilter.rules.find(
    (rule) => rule.classification === "RISK_GUARDRAIL",
  ).eligibleUse = "paper_filter_only";

  assert.throws(
    () => validateEvidenceRegistry(riskAsPaperFilter),
    /RISK_GUARDRAIL cannot use paper_filter_only/,
  );
});

test("validator permits protocol facts only as non-calibrated hard gates", async () => {
  const protocolRegistry = await readRegistryFixture();
  const protocolRule = protocolRegistry.rules.find(
    (rule) => rule.classification === "ENGINEERING_INVARIANT",
  );
  protocolRule.classification = "PROTOCOL_FACT";
  protocolRule.eligibleUse = "hard_gate";
  protocolRule.promotionState = "PAPER_ONLY";
  protocolRule.requiresLocalCalibration = false;

  assert.doesNotThrow(() => validateEvidenceRegistry(protocolRegistry));

  protocolRule.eligibleUse = "feature_only";
  assert.throws(
    () => validateEvidenceRegistry(protocolRegistry),
    /PROTOCOL_FACT cannot use feature_only/,
  );
});

test("validator rejects non-boolean calibration flags", async () => {
  const registry = await readRegistryFixture();
  registry.rules[0].requiresLocalCalibration = "false";

  assert.throws(
    () => validateEvidenceRegistry(registry),
    /requiresLocalCalibration must be boolean/,
  );
});
