import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGmgnDeskMetrics } from "../src/integrations/gmgn/desk-metrics.mjs";

function payload(overrides = {}) {
  return {
    holder_count: "44",
    market_cap: "35000",
    creation_timestamp: 1788606000,
    launchpad_progress: "0.12",
    suspected_insider_hold_rate: "0.07",
    rug_ratio: "0.005",
    pool: { creation_timestamp: 1788606600 },
    price: {
      volume_5m: "16000",
      buy_volume_5m: "10000",
      sell_volume_5m: "6000",
      swaps_5m: 88,
    },
    stat: {
      holder_count: 44,
      creator_hold_rate: "0.04",
      top_bundler_trader_percentage: "0.13",
      fresh_wallet_rate: "0.25",
      top70_sniper_hold_rate: "0.18",
      top_entrapment_trader_percentage: "0",
      top_bot_degen_percentage: "0.9",
      top_10_holder_rate: "0.21",
    },
    wallet_tags_stat: { smart_wallets: 3 },
    ...overrides,
  };
}

test("maps documented GMGN fields and converts fractions to percentages once", () => {
  const result = normalizeGmgnDeskMetrics(payload());
  assert.deepEqual(result.metrics, {
    developerPercent: 4,
    insiderPercent: 7.000000000000001,
    bundledPercent: 13,
    freshPercent: 25,
    snipersPercent: 18,
    rugPercent: 0.5,
    phishingPercent: 0,
    botTradingPercent: 90,
    top10Percent: 21,
    curveFillPercent: 12,
    smartMoneyCount: 3,
    holderCount: 44,
    marketCapUsd: 35_000,
    volume5mUsd: 16_000,
    netInflow5mUsd: 4_000,
    transactions5m: 88,
    tokenCreatedAtUnix: 1_788_606_000,
    migrationAtUnix: 1_788_606_600,
  });
  assert.equal(result.sourceFields.developerPercent, "stat.creator_hold_rate");
  assert.deepEqual(result.invalidFields, []);
});

test("never guesses that a rate above one is already a percent", () => {
  const result = normalizeGmgnDeskMetrics(payload({
    stat: { ...payload().stat, creator_hold_rate: "4" },
  }));
  assert.equal(result.metrics.developerPercent, null);
  assert.equal(result.invalidFields[0].field, "developerPercent");
  assert.equal(result.invalidFields[0].expected, "fraction_between_0_and_1");
});

test("keeps a real zero distinct from missing data and derives transaction fallback", () => {
  const source = payload();
  delete source.price.swaps_5m;
  source.price.buys_5m = 45;
  source.price.sells_5m = 0;
  source.stat.creator_hold_rate = 0;
  const result = normalizeGmgnDeskMetrics(source);
  assert.equal(result.metrics.developerPercent, 0);
  assert.equal(result.metrics.transactions5m, 45);
  assert.equal(result.missingFields.includes("developerPercent"), false);
});

test("does not turn an unpopulated GMGN stat block into passing zero-risk evidence", () => {
  const source = payload();
  source.stat = {
    holder_count: 44,
    creator_hold_rate: 0,
    top_bundler_trader_percentage: 0,
    top70_sniper_hold_rate: 0,
    top_rat_trader_percentage: 0,
    top_entrapment_trader_percentage: 0,
    bot_degen_rate: 0,
    fresh_wallet_rate: 0,
    private_vault_hold_rate: 0,
    creator_created_count: 0,
    top_10_holder_rate: 0,
  };
  const result = normalizeGmgnDeskMetrics(source);
  assert.equal(result.sourceQuality.statBlockPopulated, false);
  assert.equal(result.metrics.developerPercent, null);
  assert.equal(result.metrics.top10Percent, null);
  assert.match(result.invalidFields[0].expected, /populated_stat_block/);
});
