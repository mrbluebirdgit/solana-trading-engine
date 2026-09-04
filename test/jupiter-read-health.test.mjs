import assert from "node:assert/strict";
import test from "node:test";

import {
  checkJupiterReadAccess,
  jupiterHealthConstants,
} from "../src/integrations/jupiter/read-health.mjs";

const apiKey = "jupiter_api_key_for_testing_only";

test("authenticates a read-only Jupiter price request", async () => {
  let capturedUrl;
  let capturedOptions;

  const result = await checkJupiterReadAccess(apiKey, {
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;

      return {
        ok: true,
        json: async () => ({
          [jupiterHealthConstants.solMint]: { usdPrice: 150.25 },
        }),
      };
    },
  });

  assert.deepEqual(result, {
    ok: true,
    capability: "price-v3",
    network: "solana-mainnet",
  });
  assert.equal(capturedUrl.origin + capturedUrl.pathname, jupiterHealthConstants.priceEndpoint);
  assert.equal(capturedUrl.searchParams.get("ids"), jupiterHealthConstants.solMint);
  assert.equal(capturedOptions.headers["x-api-key"], apiKey);
});

test("classifies a rejected Jupiter key without exposing it", async () => {
  await assert.rejects(
    checkJupiterReadAccess(apiKey, {
      fetchImpl: async () => ({ ok: false, status: 401 }),
    }),
    (error) => {
      assert.match(error.message, /rejected the API key/);
      assert.equal(error.message.includes(apiKey), false);
      return true;
    },
  );
});

test("rejects a malformed Jupiter price response", async () => {
  await assert.rejects(
    checkJupiterReadAccess(apiKey, {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({}),
      }),
    }),
    /did not contain a valid SOL price/,
  );
});
