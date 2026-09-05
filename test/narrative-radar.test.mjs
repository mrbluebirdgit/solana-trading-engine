import assert from "node:assert/strict";
import test from "node:test";

import { createAttentionSample, createMintCandidate } from "../src/core/narrative/contracts.mjs";
import { createNarrativeRadar } from "../src/core/runtime/narrative-radar.mjs";

const NOW = new Date("2026-09-05T12:00:00.000Z");

function config(overrides = {}) {
  return {
    narrativeRadarEnabled: true,
    narrativePollIntervalMs: 60_000,
    narrativeAlertMinimumPriority: 1,
    narrativeMaximumConfirmationTerms: 3,
    narrativeXWoeids: [1],
    narrativeXRecentSearchEnabled: false,
    narrativeGdeltEnabled: false,
    narrativeRssFeeds: [],
    xBearerToken: "x-key",
    lunarCrushApiKey: null,
    newsApiKey: null,
    heliusApiKey: "helius-key",
    notify: true,
    ...overrides,
  };
}

function attention() {
  return createAttentionSample({
    sourceMethodVersion: "test.v1",
    provider: "x",
    sourceFamily: "social_direct",
    sourceItemId: "x-1",
    label: "Keyboard Cat",
    occurredAt: NOW.toISOString(),
    observedAt: NOW.toISOString(),
    upstreamSources: ["x"],
    metrics: {},
  }, { now: NOW });
}

function candidate() {
  return createMintCandidate({
    sourceMethodVersion: "test.v1",
    mint: "mint-1",
    name: "Keyboard Cat",
    symbol: "KCAT",
    imageUrl: "https://example.com/cat.png",
    socialLinks: ["https://x.com/cat"],
    observedAt: NOW.toISOString(),
    eventSlot: 10,
    venueStage: "pump_curve_active",
    canonicalPumpEvent: true,
  }, { now: NOW });
}

test("radar writes evidence and sends at most one observation-only alert per pair", async () => {
  const records = [];
  const alerts = [];
  let scheduled;
  const radar = createNarrativeRadar({
    config: config(),
    append: async (record) => { records.push(record); },
    deliver: async (alert) => { alerts.push(alert); },
    logger: { error: () => {} },
    clock: () => NOW,
    setTimeoutImpl: (callback) => { scheduled = callback; return 1; },
    clearTimeoutImpl: () => {},
    runPipelineImpl: async ({ index }) => {
      index.ingestAttention([attention()]);
      return {
        configuredAdapterCount: 1,
        successfulAdapterCount: 1,
        configuredDiscoveryAdapterCount: 1,
        successfulDiscoveryAdapterCount: 1,
        configuredConfirmationAdapterCount: 0,
        successfulConfirmationAdapterCount: 0,
        acceptedSampleCount: 1,
        narrativeCount: 1,
        adapterResults: [{ name: "x", ok: true, samples: [attention()], error: null }],
        matches: [],
      };
    },
    enrichPumpMintImpl: async () => candidate(),
  });
  await radar.start();
  assert.equal(typeof scheduled, "function");
  await radar.observePumpMint({
    mint: "mint-1",
    eventSlot: 10,
    venueStage: "pump_curve_active",
    observedAt: NOW.toISOString(),
  });
  await radar.observePumpMint({
    mint: "mint-1",
    eventSlot: 10,
    venueStage: "pump_curve_active",
    observedAt: NOW.toISOString(),
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].runtimeAuthority, false);
  assert.match(alerts[0].body, /not a success probability/);
  assert.equal(records.filter((record) => record.recordType === "narrative_mint_match").length, 2);
  await radar.stop();
});

test("radar refuses to start without an actual discovery source", () => {
  assert.throws(
    () => createNarrativeRadar({
      config: config({ xBearerToken: null }),
      append: async () => {},
      deliver: async () => {},
    }),
    /at least one configured discovery source/,
  );
});

test("radar does not report an alert as sent when notifications are disabled", async () => {
  const radar = createNarrativeRadar({
    config: config({ notify: false }),
    append: async () => {},
    deliver: async () => { throw new Error("delivery must remain disabled"); },
    logger: { error: () => {} },
    clock: () => NOW,
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {},
    runPipelineImpl: async ({ index }) => {
      index.ingestAttention([attention()]);
      return {
        configuredAdapterCount: 1,
        successfulAdapterCount: 1,
        configuredDiscoveryAdapterCount: 1,
        successfulDiscoveryAdapterCount: 1,
        configuredConfirmationAdapterCount: 0,
        successfulConfirmationAdapterCount: 0,
        acceptedSampleCount: 1,
        narrativeCount: 1,
        adapterResults: [{ name: "x", ok: true, samples: [attention()], error: null }],
        matches: [],
      };
    },
    enrichPumpMintImpl: async () => candidate(),
  });
  await radar.start();
  await radar.observePumpMint({
    mint: "mint-1",
    eventSlot: 10,
    venueStage: "pump_curve_active",
    observedAt: NOW.toISOString(),
  });
  assert.equal(radar.state().alertsSent, 0);
  await radar.stop();
});
