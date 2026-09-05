import assert from "node:assert/strict";
import test from "node:test";

import {
  readSolscanCandidateEvidence,
  readSolscanPrice,
} from "../src/integrations/solscan/token-evidence.mjs";

function response(data, { status = 200, retryAfter = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => retryAfter },
    json: async () => ({ success: true, data }),
  };
}

test("reads bounded Solscan metadata and top-holder evidence for one candidate", async () => {
  const paths = [];
  let permits = 0;
  const evidence = await readSolscanCandidateEvidence({
    apiKey: "solscan-test-key",
    mint: "MintOne",
    budget: {
      take: async () => { permits += 1; return { ok: true }; },
      succeed: async () => {},
      blockFor: async () => {},
    },
    now: () => new Date("2026-09-05T12:00:00.000Z"),
    fetchImpl: async (url, options) => {
      paths.push(url.pathname);
      assert.equal(options.headers.token, "solscan-test-key");
      assert.equal(url.searchParams.get("address"), "MintOne");
      if (url.pathname.endsWith("/token/meta")) {
        return response({
          address: "MintOne",
          name: "Example",
          symbol: "EX",
          price: 0.001,
          market_cap: 100_000,
          total_dex_vol_24h: 7_500,
          holder: 350,
          mint_authority: null,
          freeze_authority: "FreezeAuthority",
          created_time: 1_788_000_000,
        });
      }
      assert.equal(url.searchParams.get("page_size"), "10");
      return response({
        total: 350,
        items: [
          { percentage: 12 },
          { percentage: 8 },
          { percentage: 3 },
        ],
      });
    },
  });
  assert.equal(permits, 2);
  assert.deepEqual(paths.sort(), ["/v2.0/token/holders", "/v2.0/token/meta"]);
  assert.equal(evidence.observation.market.priceUsd, 0.001);
  assert.equal(evidence.observation.ownership.holderCount, 350);
  assert.equal(evidence.observation.ownership.top10HolderShare, 0.23);
  assert.equal(evidence.observation.riskEvidence.mintAuthorityRenounced, true);
  assert.equal(evidence.observation.riskEvidence.freezeAuthorityRenounced, false);
  assert.deepEqual(evidence.capabilities, ["market", "security", "holders"]);
});

test("keeps Solscan metadata when the holders endpoint is unavailable", async () => {
  const evidence = await readSolscanCandidateEvidence({
    apiKey: "solscan-test-key",
    mint: "MintOne",
    budget: { take: async () => ({ ok: true }), blockFor: async () => {} },
    fetchImpl: async (url) => url.pathname.endsWith("/token/meta")
      ? response({ address: "MintOne", price: 0.002 })
      : response({}, { status: 403 }),
  });
  assert.equal(evidence.observation.market.priceUsd, 0.002);
  assert.deepEqual(evidence.capabilities, ["market", "security"]);
  assert.equal(evidence.partialErrors.length, 1);
});

test("honors Retry-After after Solscan returns 429", async () => {
  let blockedFor = null;
  await assert.rejects(
    readSolscanPrice({
      apiKey: "solscan-test-key",
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

test("returns a timestamped Solscan price checkpoint", async () => {
  const result = await readSolscanPrice({
    apiKey: "solscan-test-key",
    mint: "MintOne",
    budget: { take: async () => ({ ok: true }), blockFor: async () => {} },
    now: () => new Date("2026-09-05T12:01:00.000Z"),
    fetchImpl: async () => response({ address: "MintOne", price: 0.003 }),
  });
  assert.equal(result.provider, "solscan");
  assert.equal(result.priceUsd, 0.003);
  assert.equal(result.observedAt, "2026-09-05T12:01:00.000Z");
});

test("rejects Solscan metadata for a different mint", async () => {
  await assert.rejects(
    readSolscanPrice({
      apiKey: "solscan-test-key",
      mint: "MintOne",
      budget: { take: async () => ({ ok: true }), blockFor: async () => {} },
      fetchImpl: async () => response({ address: "MintTwo", price: 0.003 }),
    }),
    /did not match the requested mint/,
  );
});
