import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { parsePolicy, validatePolicy } from "../src/config/policy.mjs";

async function loadPolicy() {
  const source = await readFile(
    new URL("../config/policy.v1.yaml", import.meta.url),
    "utf8",
  );
  return parsePolicy(source);
}

test("loads the versioned policy with the requested opportunity thresholds", async () => {
  const policy = await loadPolicy();

  assert.equal(policy.policyVersion, "1.1.0");
  assert.equal(policy.alerts.minimumSingleBuyUsd, 10_000);
  assert.equal(policy.freshnessAndExecution.maximumSignalDataAgeSeconds, 15);
  assert.equal(policy.freshnessAndExecution.maximumCopyPriceMovePercent, 15);
  assert.equal(policy.freshnessAndExecution.maximumPriceImpactPercent, 2);
  assert.equal(policy.freshnessAndExecution.maximumSlippagePercent, 8);
  assert.equal(policy.tokenSafety.graduated.minimumLiquiditySol, 30);
  assert.equal(policy.tokenSafety.graduated.maximumTop10HolderPercent, 25);
  assert.equal(
    policy.tokenSafety.graduated.maximumBundlerOrRelatedEarlyHolderPercent,
    10,
  );
  assert.equal(
    policy.tokenSafety.graduated.minimumIndependentTierAEntitiesForAutoExecution,
    3,
  );
  assert.equal(Object.isFrozen(policy), true);
});

test("keeps live trading locked and rejects weakened hard safety rules", async () => {
  const policy = structuredClone(await loadPolicy());
  policy.operatingMode.liveTrading = true;

  assert.throws(() => validatePolicy(policy), /live trading must remain disabled/);

  const unsafePolicy = structuredClone(await loadPolicy());
  unsafePolicy.portfolioRisk.noAveragingDown = false;

  assert.throws(() => validatePolicy(unsafePolicy), /noAveragingDown/);
});

test("requires coherent position limits and scoring weights", async () => {
  const incoherent = structuredClone(await loadPolicy());
  incoherent.portfolioRisk.initialPositionPercentOfTradingBankroll = 6;

  assert.throws(() => validatePolicy(incoherent), /initial <=/);

  const badWeights = structuredClone(await loadPolicy());
  badWeights.entityScoring.weights.recentContinuedActivity = 11;

  assert.throws(() => validatePolicy(badWeights), /totaling 100/);
});

test("prevents static wallet lists from becoming strategy or execution authority", async () => {
  const policy = await loadPolicy();

  assert.equal(
    policy.inputGovernance.walletInputs.repositoryShipsWithPreloadedEntries,
    false,
  );
  assert.equal(
    policy.inputGovernance.walletInputs.staticWatchlistsRequireExplicitUserApproval,
    true,
  );
  assert.equal(
    policy.inputGovernance.walletInputs.maximumAuthority,
    "candidate_nomination",
  );
  assert.equal(
    policy.entityScoring.tiers.tierA.mode,
    "priority_alert_and_paper_evaluation",
  );

  await assert.rejects(
    access(new URL("../config/seed-wallets.v1.json", import.meta.url)),
    (error) => error?.code === "ENOENT",
  );

  const preloadedPolicy = structuredClone(policy);
  preloadedPolicy.inputGovernance.walletInputs.repositoryShipsWithPreloadedEntries =
    true;
  assert.throws(() => validatePolicy(preloadedPolicy), /must remain disabled/);

  const unapprovedWatchlistPolicy = structuredClone(policy);
  unapprovedWatchlistPolicy.inputGovernance.walletInputs.staticWatchlistsRequireExplicitUserApproval =
    false;
  assert.throws(
    () => validatePolicy(unapprovedWatchlistPolicy),
    /must remain enabled/,
  );

  const elevatedAuthorityPolicy = structuredClone(policy);
  elevatedAuthorityPolicy.inputGovernance.walletInputs.maximumAuthority =
    "trade_eligibility";
  assert.throws(
    () => validatePolicy(elevatedAuthorityPolicy),
    /candidate nomination/,
  );

  const copyModePolicy = structuredClone(policy);
  copyModePolicy.entityScoring.tiers.tierA.mode =
    "priority_alert_and_paper_copy";
  assert.throws(() => validatePolicy(copyModePolicy), /cannot directly authorize/);
});
