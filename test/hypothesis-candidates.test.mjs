import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseHypothesisCandidates,
  validateHypothesisCandidates,
} from "../src/config/hypothesis-candidates.mjs";

const registryUrl = new URL(
  "../config/hypothesis-candidates.v1.json",
  import.meta.url,
);

async function loadRawRegistry() {
  return JSON.parse(await readFile(registryUrl, "utf8"));
}

test("parses a non-authoritative replay and paper candidate matrix", async () => {
  const registry = parseHypothesisCandidates(await readFile(registryUrl, "utf8"));
  const result = validateHypothesisCandidates(registry);

  assert.equal(registry.projectStatus, "LIVE_LOCKED");
  assert.equal(registry.runtimeAuthority, false);
  assert.deepEqual(registry.allowedUses, ["chronological_replay", "forward_paper"]);
  assert.deepEqual(registry.forbiddenUses, [
    "runtime_policy",
    "live_execution",
    "transaction_signing",
  ]);
  assert.ok(result.candidateCount >= 50);
  assert.equal(result.exitLadderCount, 2);
  assert.equal(result.sourceCount, 2);
  assert.equal(
    registry.candidates.every(
      (candidate) =>
        candidate.classification === "UNVALIDATED_HYPOTHESIS" &&
        candidate.validationStatus === "UNVALIDATED",
    ),
    true,
  );
});

test("attributes numeric candidates to chat, not to the attached README", async () => {
  const registry = parseHypothesisCandidates(await readFile(registryUrl, "utf8"));
  const chat = registry.sourceIntakes.find(
    (source) => source.id === "supplied_chat_strategy_2026_09_04",
  );
  const attachment = registry.sourceIntakes.find(
    (source) => source.id === "attached_readme_2026_09_04",
  );

  assert.equal(chat.sha256, null);
  assert.equal(chat.artifactName, null);
  assert.equal(
    attachment.sha256,
    "be4a702a55256cc8f5bf57eadcd26adbf13883d027b1aaa74da2a9ede6d7ded6",
  );
  assert.equal(
    registry.candidates.every(
      (candidate) => candidate.sourceRef === "supplied_chat_strategy_2026_09_04",
    ),
    true,
  );
  assert.equal(
    registry.exitLadders.every(
      (ladder) => ladder.sourceRef === "supplied_chat_strategy_2026_09_04",
    ),
    true,
  );
});

test("deep-freezes candidates, values, ladders, and ladder steps", async () => {
  const registry = parseHypothesisCandidates(await readFile(registryUrl, "utf8"));

  assert.equal(Object.isFrozen(registry), true);
  assert.equal(Object.isFrozen(registry.candidates), true);
  assert.equal(Object.isFrozen(registry.candidates[0]), true);
  assert.equal(Object.isFrozen(registry.candidates[0].candidateValues), true);
  assert.equal(Object.isFrozen(registry.exitLadders[0].steps[0]), true);
  assert.throws(() => {
    registry.candidates[0].candidateValues[0] = 999;
  }, TypeError);
  assert.throws(() => {
    registry.exitLadders[0].runnerAllocationRatio = 0;
  }, TypeError);
});

test("contains no selected, active, runtime, signer, or action value", async () => {
  const registry = parseHypothesisCandidates(await readFile(registryUrl, "utf8"));
  const forbidden = new Set([
    "active",
    "activevalue",
    "selected",
    "selectedvalue",
    "enabled",
    "live",
    "livetrading",
    "liveauthority",
    "runtimeauthority",
    "runtimepolicy",
    "runtimevalue",
    "action",
    "buy",
    "sell",
    "signer",
    "privatekey",
    "secret",
    "walletseed",
  ]);

  function inspect(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      const normalized = key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
      assert.equal(forbidden.has(normalized), false, `forbidden key ${key}`);
      inspect(nested);
    }
  }

  inspect(registry.candidates);
  inspect(registry.exitLadders);
});

test("rejects malformed numeric and out-of-range ratio candidates", async () => {
  const malformed = await loadRawRegistry();
  malformed.candidates[0].candidateValues = [Number.POSITIVE_INFINITY];
  assert.throws(
    () => validateHypothesisCandidates(malformed),
    /finite number/,
  );

  const ratio = await loadRawRegistry();
  const ratioCandidate = ratio.candidates.find((candidate) => candidate.unit === "ratio");
  ratioCandidate.operator = "maximum";
  ratioCandidate.candidateValues = [1.01];
  assert.throws(
    () => validateHypothesisCandidates(ratio),
    /between zero and one/,
  );

  const reversedRange = await loadRawRegistry();
  const rangedCandidate = reversedRange.candidates.find(
    (candidate) => candidate.operator === "range",
  );
  rangedCandidate.candidateValues = [{ min: 2, max: 1 }];
  assert.throws(
    () => validateHypothesisCandidates(reversedRange),
    /range min cannot exceed max/,
  );
});

test("rejects duplicate IDs and forbidden experiment keys", async () => {
  const duplicate = await loadRawRegistry();
  duplicate.candidates[1].id = duplicate.candidates[0].id;
  assert.throws(
    () => validateHypothesisCandidates(duplicate),
    /Duplicate hypothesis candidate/,
  );

  const forbidden = await loadRawRegistry();
  forbidden.activeValue = 0.1;
  assert.throws(
    () => validateHypothesisCandidates(forbidden),
    /forbidden field activeValue/,
  );

  const forbiddenNested = await loadRawRegistry();
  forbiddenNested.candidates[0].action = "authorize";
  assert.throws(
    () => validateHypothesisCandidates(forbiddenNested),
    /forbidden field action/,
  );
});

test("requires absent catalog features to remain explicitly unimplemented", async () => {
  const registry = await loadRawRegistry();
  const candidate = registry.candidates.find(
    (item) => item.implementationStatus === "UNIMPLEMENTED",
  );
  candidate.featureRef = "not.in.catalog";

  assert.throws(
    () => validateHypothesisCandidates(registry),
    /must have a null featureRef/,
  );
});
