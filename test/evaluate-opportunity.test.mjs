import assert from "node:assert/strict";
import test from "node:test";

import { evaluateOpportunity } from "../src/core/decision/evaluate-opportunity.mjs";
import { handleObserverMessage } from "../src/integrations/helius/logs-observer.mjs";

const baseStage = {
  mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  venueStage: "pump_curve_active",
  observedAt: "2026-09-04T06:42:00.000Z",
  cutoffSlot: 1,
};

const baseQuotes = {
  source: "jupiter",
  mint: baseStage.mint,
  intendedBuyLamports: "50000000",
  runtimeAuthority: false,
  buyPriceImpactPercent: 0.4,
  sellPriceImpactPercent: 0.8,
  roundTripRetention: 0.96,
  buy: {
    provider: "jupiter",
    quotedAt: "2026-09-04T06:42:02.000Z",
    input: { mint: "So11111111111111111111111111111111111111112", amountAtomic: "50000000" },
    output: { mint: baseStage.mint, amountAtomic: "1000" },
    execution: { priceImpactPercent: 0.4 },
  },
  sell: {
    provider: "jupiter",
    quotedAt: "2026-09-04T06:42:03.000Z",
    input: { mint: baseStage.mint, amountAtomic: "1000" },
    output: { mint: "So11111111111111111111111111111111111111112", amountAtomic: "48000000" },
    execution: { priceImpactPercent: 0.8 },
  },
};

test("rejects an unresolved stage", () => {
  const result = evaluateOpportunity({
    stage: { mint: baseStage.mint, venueStage: "unknown", abstentionReason: "missing curve" },
  });
  assert.equal(result.decision, "REJECT");
  assert.equal(result.runtimeAuthority, false);
});

test("rejects impact above the 2% guardrail", () => {
  const result = evaluateOpportunity({
    stage: baseStage,
    quotes: {
      ...baseQuotes,
      buyPriceImpactPercent: 3.1,
      buy: { ...baseQuotes.buy, execution: { priceImpactPercent: 3.1 } },
      sellPriceImpactPercent: 0.5,
      sell: { ...baseQuotes.sell, execution: { priceImpactPercent: 0.5 } },
    },
    now: "2026-09-04T06:42:05.000Z",
  });
  assert.equal(result.decision, "REJECT");
  assert.equal(result.reasons[0].code, "buy_impact");
});

test("rejects missing, invalid, or future observation timestamps", () => {
  const cases = [
    { observedAt: undefined, reason: "missing_observed_at" },
    { observedAt: 0, reason: "invalid_observed_at" },
    { observedAt: "0", reason: "invalid_observed_at" },
    { observedAt: "2026-02-30T00:00:00.000Z", reason: "invalid_observed_at" },
    { observedAt: "not-a-timestamp", reason: "invalid_observed_at" },
    { observedAt: "2026-09-04T06:42:06.000Z", reason: "future_observation" },
  ];

  for (const { observedAt, reason } of cases) {
    const result = evaluateOpportunity({
      stage: { ...baseStage, observedAt },
      quotes: baseQuotes,
      now: "2026-09-04T06:42:05.000Z",
    });
    assert.equal(result.decision, "REJECT");
    assert.equal(result.reasons[0].code, reason);
    assert.equal(result.runtimeAuthority, false);
  }
});

test("rejects a missing or invalid cutoff slot", () => {
  for (const cutoffSlot of [undefined, -1, 1.5, "1", Number.NaN, Infinity]) {
    const result = evaluateOpportunity({
      stage: { ...baseStage, cutoffSlot },
      quotes: baseQuotes,
      now: "2026-09-04T06:42:05.000Z",
    });
    assert.equal(result.decision, "REJECT");
    assert.equal(result.reasons[0].code, "invalid_cutoff_slot");
    assert.equal(result.runtimeAuthority, false);
  }
});

test("rejects missing or non-finite quote impacts", () => {
  const cases = [
    {
      quotes: { sellPriceImpactPercent: 0.8 },
      reason: "invalid_buy_impact",
    },
    {
      quotes: { buyPriceImpactPercent: Number.NaN, sellPriceImpactPercent: 0.8 },
      reason: "invalid_buy_impact",
    },
    {
      quotes: { buyPriceImpactPercent: Infinity, sellPriceImpactPercent: 0.8 },
      reason: "invalid_buy_impact",
    },
    {
      quotes: { buyPriceImpactPercent: 0.4 },
      reason: "invalid_sell_impact",
    },
    {
      quotes: { buyPriceImpactPercent: 0.4, sellPriceImpactPercent: Number.NaN },
      reason: "invalid_sell_impact",
    },
    {
      quotes: { buyPriceImpactPercent: 0.4, sellPriceImpactPercent: Infinity },
      reason: "invalid_sell_impact",
    },
  ];

  for (const { quotes, reason } of cases) {
    const result = evaluateOpportunity({
      stage: baseStage,
      quotes,
      now: "2026-09-04T06:42:05.000Z",
    });
    assert.equal(result.decision, "REJECT");
    assert.equal(result.reasons[0].code, reason);
    assert.equal(result.runtimeAuthority, false);
  }
});

test("treats favorable negative Jupiter impact as zero adverse impact", () => {
  const quotes = structuredClone(baseQuotes);
  quotes.buyPriceImpactPercent = -0.1;
  quotes.buy.execution.priceImpactPercent = -0.1;
  quotes.sellPriceImpactPercent = -0.2;
  quotes.sell.execution.priceImpactPercent = -0.2;

  const result = evaluateOpportunity({
    stage: baseStage,
    quotes,
    now: "2026-09-04T06:42:05.000Z",
  });
  assert.equal(result.decision, "ALERT_ONLY");
  assert.equal(
    result.reasons.some(({ code }) => code === "invalid_buy_impact"),
    false,
  );
});

test("alerts on a fresh curve quote and never paper-approves without a market tape", () => {
  const result = evaluateOpportunity({
    stage: baseStage,
    quotes: baseQuotes,
    now: "2026-09-04T06:42:05.000Z",
  });
  assert.equal(result.decision, "ALERT_ONLY");
  assert.equal(result.reasons.some((reason) => reason.code === "live_locked"), true);
});

test("rejects stale, reversed, or internally inconsistent route quotes", () => {
  const stale = structuredClone(baseQuotes);
  stale.buy.quotedAt = "2026-09-04T06:41:00.000Z";
  assert.equal(
    evaluateOpportunity({ stage: baseStage, quotes: stale, now: "2026-09-04T06:42:05.000Z" }).reasons[0].code,
    "invalid_quote_time",
  );

  const reversed = structuredClone(baseQuotes);
  reversed.sell.output.mint = baseStage.mint;
  assert.equal(
    evaluateOpportunity({ stage: baseStage, quotes: reversed, now: "2026-09-04T06:42:05.000Z" }).reasons[0].code,
    "quote_route_mismatch",
  );

  const inconsistent = structuredClone(baseQuotes);
  inconsistent.buy.execution.priceImpactPercent = 1.5;
  assert.equal(
    evaluateOpportunity({ stage: baseStage, quotes: inconsistent, now: "2026-09-04T06:42:05.000Z" }).reasons[0].code,
    "quote_impact_mismatch",
  );
});

test("parses observer socket payloads without exposing secrets", () => {
  const events = [];
  const parsed = handleObserverMessage(
    JSON.stringify({
      params: {
        result: {
          context: { slot: 9 },
          value: {
            signature: "sig",
            logs: [
              "Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P invoke [1]",
              "Program log: Instruction: Create",
            ],
            err: null,
          },
        },
      },
    }),
    { onEvent: (event) => events.push(event) },
  );
  assert.equal(parsed.eventType, "create");
  assert.equal(events.length, 1);
});
