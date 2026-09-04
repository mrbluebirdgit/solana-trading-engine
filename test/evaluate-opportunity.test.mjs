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
  buyPriceImpactPercent: 0.4,
  sellPriceImpactPercent: 0.8,
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
    quotes: { buyPriceImpactPercent: 3.1, sellPriceImpactPercent: 0.5 },
    now: "2026-09-04T06:42:05.000Z",
  });
  assert.equal(result.decision, "REJECT");
  assert.equal(result.reasons[0].code, "buy_impact");
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

test("parses observer socket payloads without exposing secrets", () => {
  const events = [];
  const parsed = handleObserverMessage(
    JSON.stringify({
      params: {
        result: {
          context: { slot: 9 },
          value: { signature: "sig", logs: ["Program log: Instruction: Create"], err: null },
        },
      },
    }),
    { onEvent: (event) => events.push(event) },
  );
  assert.equal(parsed.eventType, "create");
  assert.equal(events.length, 1);
});
