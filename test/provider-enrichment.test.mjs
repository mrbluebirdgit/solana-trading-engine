import assert from "node:assert/strict";
import test from "node:test";

import { createTokenObservation } from "../src/core/intelligence/token-observation.mjs";
import { createCandidateProviderEnricher } from "../src/core/narrative/provider-enrichment.mjs";

const NOW = new Date("2026-09-05T12:00:00.000Z");

function observation(source, values = {}) {
  return createTokenObservation({
    source,
    sourceMethodVersion: `${source}.test.v1`,
    chain: "solana",
    address: "MintOne",
    observedAt: NOW.toISOString(),
    market: values.market ?? {},
    ownership: values.ownership ?? {},
    behavior: values.behavior ?? {},
    riskEvidence: values.riskEvidence ?? {},
  });
}

function config() {
  return {
    birdeyeApiKey: "birdeye-key",
    gmgnApiKey: "gmgn-key",
    birdeyeDailyRequestLimit: 100,
    birdeyeDailyRequestReserve: 10,
    birdeyeBudgetStatePath: "/tmp/birdeye.json",
    gmgnDailyRequestLimit: 50,
    gmgnDailyRequestReserve: 5,
    gmgnBudgetStatePath: "/tmp/gmgn.json",
    candidateProviderTimeoutMs: 6_000,
  };
}

function createBudget() {
  return {
    ready: async () => {},
    take: async () => ({ ok: true }),
    blockFor: async () => {},
    snapshot: () => ({ ready: true }),
    flush: async () => {},
  };
}

test("combines Birdeye market/security and GMGN wallet evidence without averaging providers", async () => {
  const enricher = createCandidateProviderEnricher({
    config: config(),
    clock: () => NOW,
    createBudgetImpl: createBudget,
    readBirdeyeCandidateImpl: async () => ({
      observation: observation("birdeye", {
        market: { priceUsd: 0.001, liquidityUsd: 25_000, marketCapUsd: 100_000 },
        ownership: { holderCount: 300, top10HolderShare: 0.2 },
        riskEvidence: { mintAuthorityRenounced: true, freezeAuthorityRenounced: true },
      }),
      capabilities: ["market", "security"],
      partialErrors: [],
    }),
    readGmgnCandidateImpl: async () => ({
      observation: observation("gmgn", {
        market: { priceUsd: 0.0011, liquidityUsd: 24_000 },
        behavior: {
          smartMoneyParticipants: 5,
          notableWalletParticipants: 2,
          providerBundledTradingVolumeShare: 0.07,
        },
        riskEvidence: { providerRugRatio: 0.08 },
      }),
      capabilities: ["wallet_labels"],
      partialErrors: [],
    }),
  });
  await enricher.start();
  const result = await enricher.enrich({ mint: "MintOne" });
  assert.equal(result.market.priceUsd, 0.001);
  assert.equal(result.market.priceProvider, "birdeye");
  assert.equal(result.market.smartMoneyParticipants, 5);
  assert.equal(result.market.smartMoneyProvider, "gmgn");
  assert.equal(result.market.mintAuthorityRenounced, true);
  assert.equal(result.market.rugRatioProvider, "gmgn");
  assert.equal(result.providers.every((provider) => provider.runtimeAuthority === false), true);
  await enricher.stop();
});

test("falls back to GMGN when Birdeye cannot provide a checkpoint price", async () => {
  let birdeyeCalls = 0;
  let gmgnCalls = 0;
  const enricher = createCandidateProviderEnricher({
    config: config(),
    clock: () => NOW,
    createBudgetImpl: createBudget,
    readBirdeyePriceImpl: async () => {
      birdeyeCalls += 1;
      throw new Error("not listed yet");
    },
    readGmgnPriceImpl: async () => {
      gmgnCalls += 1;
      return {
        provider: "gmgn",
        priceUsd: 0.002,
        observedAt: NOW.toISOString(),
      };
    },
  });
  await enricher.start();
  const result = await enricher.readPrice({ mint: "MintOne" });
  assert.equal(result.provider, "gmgn");
  assert.equal(birdeyeCalls, 1);
  assert.equal(gmgnCalls, 1);
  await enricher.stop();
});
