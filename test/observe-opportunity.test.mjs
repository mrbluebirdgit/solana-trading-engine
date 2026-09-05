import assert from "node:assert/strict";
import test from "node:test";

import { observeOpportunity } from "../src/core/intelligence/observe-opportunity.mjs";

const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

test("composes stage, quote, evaluator, and alert inputs without authority", async () => {
  const calls = [];
  const stage = {
    mint: MINT,
    venueStage: "migration_pending",
    cutoffSlot: 42,
    observedAt: "2026-09-04T12:00:00.000Z",
    runtimeAuthority: false,
  };
  const quotes = {
    mint: MINT,
    buyPriceImpactPercent: 0.4,
    sellPriceImpactPercent: 0.8,
    runtimeAuthority: false,
  };
  const alert = { title: "candidate", body: "observe only", runtimeAuthority: false };
  const decision = { decision: "ALERT_ONLY", runtimeAuthority: false };

  const result = await observeOpportunity(
    {
      heliusApiKey: "helius",
      jupiterApiKey: "jupiter",
      mint: MINT,
      buyLamports: "50000000",
      minContextSlot: 40,
      now: () => new Date("2026-09-04T12:00:05.000Z"),
    },
    {
      collectStageImpl: async (apiKey, mint, options) => {
        calls.push(["stage", apiKey, mint, options.minContextSlot]);
        return stage;
      },
      quoteIntendedSizeImpl: async (request) => {
        calls.push(["quote", request.apiKey, request.mint, request.buyLamports]);
        return quotes;
      },
      formatAlertImpl: (input) => {
        calls.push(["alert", input.mint, input.cutoffSlot]);
        return alert;
      },
      evaluateImpl: (input) => {
        calls.push(["decision", input.stage, input.quotes, input.quoteError]);
        return decision;
      },
    },
  );

  assert.deepEqual(calls, [
    ["stage", "helius", MINT, 40],
    ["quote", "jupiter", MINT, "50000000"],
    ["alert", MINT, 42],
    ["decision", stage, quotes, null],
  ]);
  assert.equal(result.stage, stage);
  assert.equal(result.quotes, quotes);
  assert.equal(result.alert, alert);
  assert.equal(result.decision, decision);
  assert.equal(result.observationOutcome, "complete");
  assert.equal(result.runtimeAuthority, false);
});

test("passes quote failure to the evaluator without fabricating quote data", async () => {
  let evaluated;
  const result = await observeOpportunity(
    {
      heliusApiKey: "helius",
      jupiterApiKey: "jupiter",
      mint: MINT,
      now: () => new Date("2026-09-04T12:00:05.000Z"),
    },
    {
      collectStageImpl: async () => ({
        mint: MINT,
        venueStage: "pump_curve_active",
        cutoffSlot: 42,
        observedAt: "2026-09-04T12:00:00.000Z",
        runtimeAuthority: false,
      }),
      quoteIntendedSizeImpl: async () => { throw new Error("quote unavailable"); },
      formatAlertImpl: () => ({ runtimeAuthority: false }),
      evaluateImpl: (input) => {
        evaluated = input;
        return { decision: "REJECT", runtimeAuthority: false };
      },
    },
  );

  assert.equal(result.quotes, null);
  assert.equal(result.quoteError, "quote unavailable");
  assert.equal(evaluated.quotes, null);
  assert.equal(evaluated.quoteError, "quote unavailable");
  assert.equal(result.decision.decision, "REJECT");
  assert.equal(result.observationOutcome, "provider_failure");
});

test("preserves candidate-level route-unavailable semantics", async () => {
  const routeError = Object.assign(new Error("no route"), {
    code: "route_unavailable",
    scope: "candidate",
  });
  const result = await observeOpportunity(
    {
      heliusApiKey: "helius",
      jupiterApiKey: "jupiter",
      mint: MINT,
      now: () => new Date("2026-09-04T12:00:05.000Z"),
    },
    {
      collectStageImpl: async () => ({
        mint: MINT,
        venueStage: "pump_curve_active",
        cutoffSlot: 42,
        observedAt: "2026-09-04T12:00:00.000Z",
        runtimeAuthority: false,
      }),
      quoteIntendedSizeImpl: async () => { throw routeError; },
      formatAlertImpl: () => ({ runtimeAuthority: false }),
      evaluateImpl: () => ({ decision: "REJECT", runtimeAuthority: false }),
    },
  );
  assert.equal(result.quoteErrorCode, "route_unavailable");
  assert.equal(result.quoteErrorScope, "candidate");
  assert.equal(result.observationOutcome, "candidate_rejection");
});

test("scopes known unsupported Token-2022 stages to the candidate", async () => {
  const result = await observeOpportunity(
    {
      heliusApiKey: "helius",
      jupiterApiKey: "jupiter",
      mint: MINT,
      now: () => new Date("2026-09-04T12:00:05.000Z"),
    },
    {
      collectStageImpl: async () => ({
        mint: MINT,
        venueStage: "unknown",
        cutoffSlot: 42,
        observedAt: "2026-09-04T12:00:00.000Z",
        abstentionReason: "token_2022_extensions_uninspected",
        runtimeAuthority: false,
      }),
      quoteIntendedSizeImpl: async () => ({
        buyPriceImpactPercent: 0.1,
        sellPriceImpactPercent: 0.2,
      }),
      formatAlertImpl: () => ({ runtimeAuthority: false }),
      evaluateImpl: () => ({ decision: "REJECT", runtimeAuthority: false }),
    },
  );
  assert.equal(result.stageErrorScope, "candidate");
  assert.equal(result.observationOutcome, "candidate_rejection");
});

test("scopes decoded candidate contradictions separately from provider gaps", async () => {
  const run = (abstentionReason) => observeOpportunity(
    {
      heliusApiKey: "helius",
      jupiterApiKey: "jupiter",
      mint: MINT,
      now: () => new Date("2026-09-04T12:00:05.000Z"),
    },
    {
      collectStageImpl: async () => ({
        mint: MINT,
        venueStage: "unknown",
        cutoffSlot: 42,
        observedAt: "2026-09-04T12:00:00.000Z",
        abstentionReason,
        runtimeAuthority: false,
      }),
      quoteIntendedSizeImpl: async () => ({
        buyPriceImpactPercent: 0.1,
        sellPriceImpactPercent: 0.2,
      }),
      formatAlertImpl: () => ({ runtimeAuthority: false }),
      evaluateImpl: () => ({
        decision: "REJECT",
        reasons: [{ code: "stage_unresolved" }],
        runtimeAuthority: false,
      }),
    },
  );

  assert.equal((await run("complete_false_with_canonical_pool")).stageErrorScope, "candidate");
  assert.equal((await run("invalid_rpc_context_slot")).stageErrorScope, "provider");
});
