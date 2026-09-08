import assert from "node:assert/strict";
import test from "node:test";

import { evaluateDeskFilter } from "../src/core/decision/desk-filter.mjs";

function riskMetrics(overrides = {}) {
  return {
    developerPercent: 5,
    insiderPercent: 10,
    bundledPercent: 15,
    freshPercent: 30,
    snipersPercent: 20,
    rugPercent: 1,
    phishingPercent: 0,
    botTradingPercent: 100,
    ...overrides,
  };
}

function curve(overrides = {}) {
  return {
    ...riskMetrics(),
    smartMoneyCount: 1,
    holderCount: 20,
    top10Percent: 25,
    marketCapUsd: 8_000,
    volume5mUsd: 5_000,
    netInflow5mUsd: 0,
    transactions5m: 40,
    curveFillPercent: 2,
    ...overrides,
  };
}

function migrated(overrides = {}) {
  return {
    ...riskMetrics(),
    smartMoneyCount: 2,
    holderCount: 40,
    top10Percent: 22,
    marketCapUsd: 25_000,
    volume5mUsd: 15_000,
    netInflow5mUsd: 0,
    transactions5m: 80,
    migrationAgeMinutes: 0,
    ...overrides,
  };
}

test("passes exact curve and migrated boundaries while ignoring bot and TG fields", () => {
  const curveResult = evaluateDeskFilter({
    venueStage: "pump_curve_active",
    mintAuthority: "renounced",
    freezeAuthority: "renounced",
    metrics: { ...curve(), telegramCalls: 999_999 },
  });
  assert.equal(curveResult.decision, "SCOUT_PASS");
  assert.equal(curveResult.automaticThresholdMutation, false);

  const migratedResult = evaluateDeskFilter({
    stage: "migrated",
    mintAuthority: "renounced",
    freezeAuthority: "renounced",
    metrics: { ...migrated(), marketCapUsd: 250_000, migrationAgeMinutes: 12 },
  });
  assert.equal(migratedResult.decision, "SCOUT_PASS");
});

test("kills every risk-cap breach and authority existence before scout ranking", () => {
  for (const [field, value] of Object.entries({
    developerPercent: 5.01,
    insiderPercent: 10.01,
    bundledPercent: 15.01,
    freshPercent: 30.01,
    snipersPercent: 20.01,
    rugPercent: 1.01,
    phishingPercent: 0.01,
  })) {
    const result = evaluateDeskFilter({
      stage: "curve",
      mintAuthority: "renounced",
      freezeAuthority: "renounced",
      metrics: curve({ [field]: value }),
    });
    assert.equal(result.decision, "RISK_KILL", field);
    assert.equal(result.killSignal, true, field);
  }
  assert.equal(evaluateDeskFilter({
    stage: "curve",
    mintAuthority: "active",
    freezeAuthority: "renounced",
    metrics: curve(),
  }).decision, "RISK_KILL");
});

test("skips missing evidence, unknown authority, unsupported stages, and scout misses", () => {
  assert.equal(evaluateDeskFilter({
    stage: "curve",
    mintAuthority: "renounced",
    freezeAuthority: "renounced",
    metrics: curve({ smartMoneyCount: 0 }),
  }).decision, "SCOUT_SKIP");
  assert.equal(evaluateDeskFilter({
    stage: "migrated",
    mintAuthority: "renounced",
    freezeAuthority: "renounced",
    metrics: migrated({ migrationAgeMinutes: 12.01 }),
  }).decision, "SCOUT_SKIP");
  assert.equal(evaluateDeskFilter({
    stage: "curve",
    mintAuthority: "unknown",
    freezeAuthority: "renounced",
    metrics: curve(),
  }).decision, "SCOUT_SKIP");
  assert.equal(evaluateDeskFilter({
    stage: "curve",
    mintAuthority: "renounced",
    freezeAuthority: "renounced",
    metrics: curve({ holderCount: null }),
  }).decision, "SCOUT_SKIP");
  assert.equal(evaluateDeskFilter({
    venueStage: "migration_pending",
    mintAuthority: "renounced",
    freezeAuthority: "renounced",
    metrics: curve(),
  }).decision, "SCOUT_SKIP");
});
