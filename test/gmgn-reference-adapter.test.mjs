import assert from "node:assert/strict";
import test from "node:test";

import { createTokenObservation } from "../src/core/intelligence/token-observation.mjs";
import { normalizeGmgnToken } from "../src/integrations/gmgn/normalize.mjs";
import { checkGmgnReadAccess } from "../src/integrations/gmgn/read-health.mjs";

const TEST_KEY = "gmgn_personal_api_key_for_testing";

test("creates a provider-independent token observation", () => {
  const observation = createTokenObservation({
    source: "another-provider",
    sourceMethodVersion: "test-provider.v1",
    chain: "solana",
    address: "ExampleMint",
    observedAt: "2026-09-03T18:00:00.000Z",
    market: { liquidityUsd: "25000" },
  });

  assert.equal(observation.schemaVersion, 2);
  assert.equal(observation.source, "another-provider");
  assert.equal(observation.market.liquidityUsd, 25_000);
  assert.equal(observation.behavior.smartMoneyParticipants, null);
  assert.equal(Object.isFrozen(observation), true);
});

test("rejects malformed canonical observations instead of coercing them", () => {
  const required = {
    source: "test-provider",
    sourceMethodVersion: "test-provider.v1",
    chain: "solana",
    address: "ExampleMint",
    observedAt: "2026-09-03T18:00:00.000Z",
  };

  assert.throws(
    () => createTokenObservation({ ...required, observedAt: null }),
    /RFC 3339/,
  );
  assert.throws(
    () => createTokenObservation({ ...required, sourceMethodVersion: null }),
    /sourceMethodVersion/,
  );
  assert.throws(
    () => createTokenObservation({ ...required, market: { liquidityUsd: true } }),
    /must be numeric/,
  );
  assert.throws(
    () =>
      createTokenObservation({
        ...required,
        behavior: { providerBundlerRate: 1.01 },
      }),
    /valid numeric range/,
  );
  assert.throws(
    () => createTokenObservation({ ...required, market: [] }),
    /market must be an object/,
  );
  assert.throws(
    () =>
      createTokenObservation({
        ...required,
        market: { liquidtyUsd: 100 },
      }),
    /not a recognized field/,
  );
});

test("rejects malformed GMGN boolean labels", () => {
  assert.throws(
    () =>
      normalizeGmgnToken(
        { chain: "sol", address: "ExampleMint", is_honeypot: "no" },
        {
          observedAt: "2026-09-03T18:00:00.000Z",
          sourceMethodVersion: "gmgn-market.trending@cli-1.6.0",
        },
      ),
    /GMGN flag/,
  );
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
      bundler_trader_amount_rate: 0.07,
      rat_trader_amount_rate: 0.03,
      rug_ratio: 0.08,
      is_honeypot: 0,
      is_wash_trading: true,
      renounced_mint: 1,
      renounced_freeze_account: 1,
      launchpad_platform: "Pump.fun",
    },
    {
      observedAt: "2026-09-03T18:00:00.000Z",
      sourceMethodVersion: "gmgn-market.trending@cli-1.6.0",
    },
  );

  assert.equal(observation.source, "gmgn");
  assert.equal(
    observation.sourceMethodVersion,
    "gmgn-market.trending@cli-1.6.0",
  );
  assert.equal(observation.chain, "solana");
  assert.equal(observation.market.liquidityUsd, 25_000);
  assert.equal(observation.behavior.smartMoneyParticipants, 4);
  assert.equal(observation.behavior.providerBundlerRate, 0.12);
  assert.equal(
    observation.behavior.providerBundledTradingVolumeShare,
    0.07,
  );
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

test("passes only allowlisted environment values to the GMGN child process", async () => {
  let invocation;
  await checkGmgnReadAccess(TEST_KEY, {
    environment: {
      PATH: "/usr/local/bin:/usr/bin",
      LANG: "en_US.UTF-8",
      HELIUS_API_KEY: "must-not-reach-gmgn",
      JUPITER_API_KEY: "must-not-reach-gmgn",
      TELEGRAM_BOT_TOKEN: "must-not-reach-gmgn",
      DATABASE_URL: "must-not-reach-gmgn",
      NODE_OPTIONS: "--require=must-not-reach-gmgn",
    },
    execFileImpl: async (file, args, options) => {
      invocation = { file, args, options };
      return {
        stdout: JSON.stringify({ code: 0, data: { rank: [] } }),
        stderr: "",
      };
    },
  });

  assert.deepEqual(invocation.options.env, {
    GMGN_API_KEY: TEST_KEY,
    PATH: "/usr/local/bin:/usr/bin",
    LANG: "en_US.UTF-8",
  });
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
