import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("keeps seed wallets unverified and non-copyable", async () => {
  const source = await readFile(
    new URL("../config/seed-wallets.v1.json", import.meta.url),
    "utf8",
  );
  const seeds = JSON.parse(source);

  assert.equal(seeds.copyAuthorization, false);
  assert.equal(seeds.wallets.length, 7);
  assert.equal(
    seeds.wallets.every((wallet) => wallet.status === "unverified_seed"),
    true,
  );
});
