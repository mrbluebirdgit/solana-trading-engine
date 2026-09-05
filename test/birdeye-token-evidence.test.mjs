import assert from "node:assert/strict";
import test from "node:test";

import {
  readBirdeyeCandidateEvidence,
  readBirdeyePrice,
} from "../src/integrations/birdeye/token-evidence.mjs";

function response(data, { status = 200, retryAfter = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => retryAfter },
    json: async () => ({ success: true, data }),
  };
}

test("reads bounded Birdeye market and security evidence for one candidate", async () => {
  const paths = [];
  let permits = 0;
  const budget = {
    take: async () => { permits += 1; return { ok: true }; },
    blockFor: async () => {},
  };
  const evidence = await readBirdeyeCandidateEvidence({
    apiKey: "birdeye-test-key",
    mint: "MintOne",
    budget,
    now: () => new Date("2026-09-05T12:00:00.000Z"),
    fetchImpl: async (url, options) => {
      paths.push(url.pathname);
      assert.equal(options.headers["X-API-KEY"], "birdeye-test-key");
      assert.equal(options.headers["x-chain"], "solana");
      if (url.pathname.endsWith("token_overview")) {
        return response({
          name: "Example",
          symbol: "EX",
          price: 0.001,
          liquidity: 25_000,
          marketCap: 100_000,
          v5mUSD: 7_500,
          holder: 350,
        });
      }
      return response({
        top10HolderPercent: 22,
        creatorPercentage: 0.03,
        mintable: false,
        freezeable: false,
      });
    },
  });
  assert.equal(permits, 2);
  assert.deepEqual(paths.sort(), ["/defi/token_overview", "/defi/token_security"]);
  assert.equal(evidence.observation.market.priceUsd, 0.001);
  assert.equal(evidence.observation.ownership.top10HolderShare, 0.22);
  assert.equal(evidence.observation.riskEvidence.mintAuthorityRenounced, true);
  assert.deepEqual(evidence.capabilities, ["market", "holders", "security"]);
});

test("keeps partial Birdeye evidence when the paid security endpoint is unavailable", async () => {
  const evidence = await readBirdeyeCandidateEvidence({
    apiKey: "birdeye-test-key",
    mint: "MintOne",
    budget: {
      take: async () => ({ ok: true }),
      blockFor: async () => {},
    },
    now: () => new Date("2026-09-05T12:00:00.000Z"),
    fetchImpl: async (url) => url.pathname.endsWith("token_overview")
      ? response({ price: 0.002 })
      : response({}, { status: 403 }),
  });
  assert.equal(evidence.observation.market.priceUsd, 0.002);
  assert.deepEqual(evidence.capabilities, ["market", "holders"]);
  assert.equal(evidence.partialErrors.length, 1);
});

test("honors Retry-After after Birdeye returns 429", async () => {
  let blockedFor = null;
  await assert.rejects(
    readBirdeyePrice({
      apiKey: "birdeye-test-key",
      mint: "MintOne",
      budget: {
        take: async () => ({ ok: true }),
        blockFor: async (milliseconds) => { blockedFor = milliseconds; },
      },
      fetchImpl: async () => response({}, { status: 429, retryAfter: "120" }),
    }),
    /HTTP 429/,
  );
  assert.equal(blockedFor, 120_000);
});

test("returns a timestamped Birdeye price checkpoint", async () => {
  const result = await readBirdeyePrice({
    apiKey: "birdeye-test-key",
    mint: "MintOne",
    budget: { take: async () => ({ ok: true }), blockFor: async () => {} },
    now: () => new Date("2026-09-05T12:01:00.000Z"),
    fetchImpl: async () => response({ value: 0.003 }),
  });
  assert.equal(result.provider, "birdeye");
  assert.equal(result.priceUsd, 0.003);
  assert.equal(result.observedAt, "2026-09-05T12:01:00.000Z");
});
