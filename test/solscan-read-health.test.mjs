import assert from "node:assert/strict";
import test from "node:test";

import {
  checkSolscanReadAccess,
  solscanHealthConstants,
} from "../src/integrations/solscan/read-health.mjs";

const apiKey = "solscan_api_key_for_testing_only";

test("authenticates a read-only Solscan token metadata request", async () => {
  let capturedUrl;
  let capturedOptions;
  const result = await checkSolscanReadAccess(apiKey, {
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { address: solscanHealthConstants.solMint },
        }),
      };
    },
  });
  assert.deepEqual(result, {
    ok: true,
    capability: "token_meta",
    network: "solana-mainnet",
  });
  assert.equal(capturedUrl.searchParams.get("address"), solscanHealthConstants.solMint);
  assert.equal(capturedOptions.headers.token, apiKey);
});

test("classifies a rejected Solscan key without exposing it", async () => {
  await assert.rejects(
    checkSolscanReadAccess(apiKey, {
      fetchImpl: async () => ({ ok: false, status: 401 }),
    }),
    (error) => {
      assert.match(error.message, /rejected the API key/);
      assert.equal(error.message.includes(apiKey), false);
      return true;
    },
  );
});
