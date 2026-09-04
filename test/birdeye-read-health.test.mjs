import assert from "node:assert/strict";
import test from "node:test";

import {
  birdeyeHealthConstants,
  checkBirdeyeReadAccess,
} from "../src/integrations/birdeye/read-health.mjs";

const apiKey = "birdeye_api_key_for_testing_only";

test("authenticates a read-only Birdeye price request", async () => {
  let capturedUrl;
  let capturedOptions;

  const result = await checkBirdeyeReadAccess(apiKey, {
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { value: 150.25 },
        }),
      };
    },
  });

  assert.deepEqual(result, {
    ok: true,
    capability: "price",
    network: "solana-mainnet",
  });
  assert.equal(
    capturedUrl.origin + capturedUrl.pathname,
    birdeyeHealthConstants.priceEndpoint,
  );
  assert.equal(
    capturedUrl.searchParams.get("address"),
    birdeyeHealthConstants.solMint,
  );
  assert.equal(capturedOptions.headers["X-API-KEY"], apiKey);
  assert.equal(capturedOptions.headers["x-chain"], "solana");
});

test("classifies a rejected Birdeye key without exposing it", async () => {
  await assert.rejects(
    checkBirdeyeReadAccess(apiKey, {
      fetchImpl: async () => ({ ok: false, status: 401 }),
    }),
    (error) => {
      assert.match(error.message, /rejected the API key/);
      assert.equal(error.message.includes(apiKey), false);
      return true;
    },
  );
});

test("rejects a malformed Birdeye price response", async () => {
  await assert.rejects(
    checkBirdeyeReadAccess(apiKey, {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      }),
    }),
    /did not contain a valid SOL price/,
  );
});
