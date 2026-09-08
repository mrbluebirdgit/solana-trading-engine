import assert from "node:assert/strict";
import test from "node:test";

import { composeDeskCandidate } from "../src/core/intelligence/desk-candidate.mjs";

function migratedMetrics(migrationAtUnix) {
  return {
    source: "gmgn",
    sourceMethodVersion: "test.v1",
    missingFields: [],
    invalidFields: [],
    sourceQuality: { statBlockPopulated: true, statBlockReason: null },
    metrics: {
      developerPercent: 2,
      insiderPercent: 5,
      bundledPercent: 8,
      freshPercent: 20,
      snipersPercent: 10,
      rugPercent: 0.2,
      phishingPercent: 0,
      botTradingPercent: 90,
      smartMoneyCount: 3,
      holderCount: 80,
      top10Percent: 18,
      marketCapUsd: 75_000,
      volume5mUsd: 25_000,
      netInflow5mUsd: 5_000,
      transactions5m: 120,
      migrationAtUnix,
    },
  };
}

test("derives migrated age from the pool timestamp and passes within 12 minutes", () => {
  const result = composeDeskCandidate({
    stageEvidence: {
      mint: "MintOne",
      venueStage: "pumpswap_amm",
      mintAuthority: "renounced",
      freezeAuthority: "renounced",
      source: "helius",
      sourceMethodVersion: "test.v1",
    },
    deskMetrics: migratedMetrics(1_788_606_600),
    observedAt: new Date(1_788_606_600 * 1_000 + 11 * 60_000).toISOString(),
  });
  assert.equal(result.metrics.migrationAgeMinutes, 11);
  assert.equal(result.decision.decision, "SCOUT_PASS");
  assert.equal(result.evidence.sourceQuality.statBlockPopulated, true);
});

test("skips a future or older-than-law migration timestamp", () => {
  const base = {
    mint: "MintOne",
    venueStage: "pumpswap_amm",
    mintAuthority: "renounced",
    freezeAuthority: "renounced",
  };
  const nowSeconds = 1_788_606_600;
  assert.equal(composeDeskCandidate({
    stageEvidence: base,
    deskMetrics: migratedMetrics(nowSeconds + 60),
    observedAt: new Date(nowSeconds * 1_000).toISOString(),
  }).decision.decision, "SCOUT_SKIP");
  assert.equal(composeDeskCandidate({
    stageEvidence: base,
    deskMetrics: migratedMetrics(nowSeconds - 13 * 60),
    observedAt: new Date(nowSeconds * 1_000).toISOString(),
  }).decision.decision, "SCOUT_SKIP");
});
