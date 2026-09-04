import assert from "node:assert/strict";
import test from "node:test";

import { createTokenObservation } from "../src/core/intelligence/token-observation.mjs";
import { normalizeGmgnToken } from "../src/integrations/gmgn/normalize.mjs";
import { checkGmgnReadAccess } from "../src/integrations/gmgn/read-health.mjs";

const TEST_KEY = "gmgn_personal_api_key_for_testing";

test("creates a provider-independent token observation", () => {
  const observation = createTokenObservation({
    source: "another-provider",
    chain: "sol",
    address: "ExampleMint",
    observedAt: "2026-09-03T18:00:00.000Z",
    market: { liquidityUsd: "25000" },
  });

  assert.equal(observation.schemaVersion, 1);
  assert.equal(observation.source, "another-provider");
  assert.equal(observation.market.liquidityUsd, 25_000);
  assert.equal(observation.behavior.smartMoneyParticipants, null);
  assert.equal(Object.isFrozen(observation), true);
});

test("maps GMGN reference data into our canonical observation", () => {
  const observation = normalizeGmgnToken(
    {
      chain: "sol",
      address: "ExampleMint",
      symbol: "EXAMPLE",
      liquidity: 25_000,
      holder_count: 320,
      top_10_holder_rate: 0.22,
      smart_degen_count: 4,
      renowned_count: 2,
      sniper_count: 9,
      bundler_rate: 0.12,
      rat_trader_amount_rate: 0.03,
      rug_ratio: 0.08,
      is_honeypot: 0,
      is_wash_trading: true,
      renounced_mint: 1,
      renounced_freeze_account: 1,
      launchpad_platform: "Pump.fun",
    },
    { observedAt: "2026-09-03T18:00:00.000Z" },
  );

  assert.equal(observation.source, "gmgn");
  assert.equal(observation.market.liquidityUsd, 25_000);
  assert.equal(observation.behavior.smartMoneyParticipants, 4);
  assert.equal(observation.behavior.bundledTradeShare, 0.12);
  assert.equal(observation.riskEvidence.providerRugRatio, 0.08);
  assert.equal(observation.riskEvidence.honeypot, false);
  assert.equal(observation.riskEvidence.washTrading, true);
  assert.equal(observation.riskEvidence.mintAuthorityRenounced, true);
  assert.equal(observation.venue.launchpad, "Pump.fun");
});

test("verifies GMGN reading without placing the key in command arguments", async () => {
  let invocation;
  const result = await checkGmgnReadAccess(TEST_KEY, {
    execFileImpl: async (file, args, options) => {
      invocation = { file, args, options };
      return {
        stdout: JSON.stringify({ code: 0, data: { rank: [{}] } }),
        stderr: "",
      };
    },
  });

  assert.deepEqual(result, {
    ok: true,
    source: "gmgn",
    capability: "read-only",
    records: 1,
  });
  assert.equal(invocation.args.includes("swap"), false);
  assert.equal(invocation.args.includes(TEST_KEY), false);
  assert.equal(invocation.options.env.GMGN_API_KEY, TEST_KEY);
});

test("does not echo a GMGN API key when verification fails", async () => {
  await assert.rejects(
    checkGmgnReadAccess(TEST_KEY, {
      execFileImpl: async () => {
        const error = new Error(`request failed for ${TEST_KEY}`);
        error.code = 1;
        throw error;
      },
    }),
    (error) => {
      assert.match(error.message, /verification failed/);
      assert.equal(error.message.includes(TEST_KEY), false);
      return true;
    },
  );
});

test("classifies a rejected GMGN key without exposing it", async () => {
  await assert.rejects(
    checkGmgnReadAccess(TEST_KEY, {
      execFileImpl: async () => {
        const error = new Error("command failed");
        error.code = 1;
        error.stderr = `HTTP 401 invalid api key ${TEST_KEY}`;
        throw error;
      },
    }),
    (error) => {
      assert.match(error.message, /authorization failed/);
      assert.equal(error.message.includes(TEST_KEY), false);
      return true;
    },
  );
});
