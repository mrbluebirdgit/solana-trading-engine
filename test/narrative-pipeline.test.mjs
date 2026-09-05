import assert from "node:assert/strict";
import test from "node:test";

import { createAttentionSample, createMintCandidate } from "../src/core/narrative/contracts.mjs";
import { NarrativeIndex } from "../src/core/narrative/index.mjs";
import { runNarrativePipeline } from "../src/core/narrative/pipeline.mjs";

const NOW = new Date("2026-09-05T12:00:00.000Z");

function sample(provider, sourceItemId, sourceFamily = "social_direct") {
  return createAttentionSample({
    sourceMethodVersion: "test.v1",
    provider,
    sourceFamily,
    sourceItemId,
    label: "Keyboard Cat",
    occurredAt: NOW.toISOString(),
    observedAt: NOW.toISOString(),
    upstreamSources: [provider],
    metrics: {},
  }, { now: NOW });
}

test("pipeline fans out, isolates failures, confirms top narratives, and rematches mints", async () => {
  const index = new NarrativeIndex({ now: () => NOW });
  index.ingestMint(createMintCandidate({
    sourceMethodVersion: "test.v1",
    mint: "mint-1",
    name: "Keyboard Cat",
    symbol: "KCAT",
    socialLinks: [],
    observedAt: NOW.toISOString(),
    canonicalPumpEvent: true,
  }, { now: NOW }));
  let confirmationLabels;
  const result = await runNarrativePipeline({
    index,
    now: NOW,
    discoveryAdapters: [
      { name: "x", read: async () => [sample("x", "x-1")] },
      { name: "broken", read: async () => { throw new Error("offline"); } },
    ],
    confirmationAdapters: [{
      name: "news",
      read: async ({ labels }) => {
        confirmationLabels = labels;
        return [sample("news", "news-1", "news")];
      },
    }],
  });
  assert.deepEqual(confirmationLabels, ["Keyboard Cat"]);
  assert.equal(result.successfulAdapterCount, 2);
  assert.equal(result.successfulDiscoveryAdapterCount, 1);
  assert.equal(result.successfulConfirmationAdapterCount, 1);
  assert.equal(result.adapterResults.find((item) => item.name === "broken").ok, false);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].narrative.evidenceChannelCount, 2);
  assert.equal(result.runtimeAuthority, false);
});

test("confirmation success cannot hide total discovery failure", async () => {
  const index = new NarrativeIndex({ now: () => NOW });
  const result = await runNarrativePipeline({
    index,
    now: NOW,
    discoveryAdapters: [{
      name: "broken-discovery",
      read: async () => { throw new Error("offline"); },
    }],
    confirmationAdapters: [{ name: "empty-confirmation", read: async () => [] }],
  });
  assert.equal(result.successfulAdapterCount, 1);
  assert.equal(result.successfulDiscoveryAdapterCount, 0);
  assert.equal(result.successfulConfirmationAdapterCount, 1);
});
