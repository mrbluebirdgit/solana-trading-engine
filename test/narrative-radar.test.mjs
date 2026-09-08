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

test("enriches only alert-eligible matches and starts persisted outcome tracking", async () => {
  const records = [];
  const alerts = [];
  const tracked = [];
  let providerStopped = false;
  let trackerStopped = false;
  const evidence = {
    schemaVersion: 1,
    observedAt: NOW.toISOString(),
    mint: "mint-1",
    providers: [{
      provider: "birdeye",
      ok: true,
      observation: {},
      capabilities: ["market", "security"],
      partialErrors: [],
      error: null,
      runtimeAuthority: false,
    }, {
      provider: "gmgn",
      ok: true,
      observation: {},
      capabilities: ["wallet_labels"],
      partialErrors: [],
      error: null,
      runtimeAuthority: false,
    }],
    market: {
      priceUsd: 0.001,
      priceProvider: "birdeye",
      liquidityUsd: 25_000,
      liquidityProvider: "birdeye",
      marketCapUsd: 100_000,
      marketCapProvider: "birdeye",
      volumeUsd: 7_500,
      volumeProvider: "birdeye",
      holderCount: 350,
      holderProvider: "birdeye",
      top10HolderShare: 0.22,
      top10HolderProvider: "birdeye",
      smartMoneyParticipants: 4,
      notableWalletParticipants: 2,
      providerBundledTradingVolumeShare: 0.07,
      mintAuthorityRenounced: true,
      freezeAuthorityRenounced: true,
      providerRugRatio: 0.08,
      rugRatioProvider: "gmgn",
      runtimeAuthority: false,
    },
    runtimeAuthority: false,
  };
  const radar = createNarrativeRadar({
    config: config({
      birdeyeApiKey: "birdeye-key",
      gmgnApiKey: "gmgn-key",
      narrativeOutcomeTrackingEnabled: true,
      narrativeOutcomeNotificationsEnabled: true,
      narrativeOutcomeStatePath: "/tmp/outcomes.json",
      narrativeOutcomeCheckpointsMs: [60_000],
    }),
    append: async (record) => { records.push(record); },
    deliver: async (alert) => {
      alerts.push(alert);
      return { messageId: 77 };
    },
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
    createProviderEnricherImpl: () => ({
      start: async () => ({
        configuredProviders: ["birdeye", "gmgn"],
        providerReadiness: { birdeye: { ok: true }, gmgn: { ok: true } },
        budgets: {},
      }),
      enrich: async () => evidence,
      readPrice: async () => {},
      snapshot: () => ({ configuredProviders: ["birdeye", "gmgn"] }),
      stop: async () => { providerStopped = true; },
    }),
    createOutcomeTrackerImpl: () => ({
      start: async () => {},
      track: async (input) => { tracked.push(input); },
      snapshot: () => ({ pendingCheckpoints: 1 }),
      stop: async () => { trackerStopped = true; },
    }),
  });
  await radar.start();
  await radar.observePumpMint({
    mint: "mint-1",
    eventSlot: 10,
    venueStage: "pump_curve_active",
    observedAt: NOW.toISOString(),
  });
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /price at alert: \$0\.00100000 \(birdeye\)/);
  assert.match(alerts[0].body, /GMGN smart\/KOL wallets: 4\/2/);
  assert.equal(tracked.length, 1);
  assert.equal(tracked[0].initialPriceUsd, 0.001);
  assert.equal(
    records.some((record) => record.recordType === "narrative_candidate_provider_evidence"),
    true,
  );
  const delivery = records.find((record) => record.recordType === "narrative_alert_delivered");
  assert.equal(delivery.telegramMessageId, 77);
  assert.equal(delivery.detectionToDeliveryMs, 0);
  await radar.stop();
  assert.equal(providerStopped, true);
  assert.equal(trackerStopped, true);
});

test("does not spend candidate-provider quota below the alert floor", async () => {
  let enrichmentCalls = 0;
  const alerts = [];
  const radar = createNarrativeRadar({
    config: config({
      birdeyeApiKey: "birdeye-key",
      narrativeAlertMinimumPriority: 101,
      narrativeOutcomeTrackingEnabled: false,
    }),
    append: async () => {},
    deliver: async (alert) => { alerts.push(alert); },
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
    createProviderEnricherImpl: () => ({
      start: async () => ({
        configuredProviders: ["birdeye"],
        providerReadiness: { birdeye: { ok: true } },
        budgets: {},
      }),
      enrich: async () => { enrichmentCalls += 1; },
      readPrice: async () => {},
      snapshot: () => ({ configuredProviders: ["birdeye"] }),
      stop: async () => {},
    }),
  });

  await radar.start();
  await radar.observePumpMint({
    mint: "mint-1",
    eventSlot: 10,
    venueStage: "pump_curve_active",
    observedAt: NOW.toISOString(),
  });
  assert.equal(enrichmentCalls, 0);
  assert.equal(alerts.length, 0);
  await radar.stop();
});

test("sends the base alert when supplemental enrichment fails unexpectedly", async () => {
  const records = [];
  const alerts = [];
  const radar = createNarrativeRadar({
    config: config({
      birdeyeApiKey: "birdeye-key",
      narrativeOutcomeTrackingEnabled: false,
    }),
    append: async (record) => { records.push(record); },
    deliver: async (alert) => { alerts.push(alert); return { messageId: 88 }; },
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
    createProviderEnricherImpl: () => ({
      start: async () => ({
        configuredProviders: ["birdeye"],
        providerReadiness: { birdeye: { ok: true } },
        budgets: {},
      }),
      enrich: async () => { throw new Error("supplemental provider unavailable"); },
      readPrice: async () => {},
      snapshot: () => ({ configuredProviders: ["birdeye"] }),
      stop: async () => {},
    }),
  });

  await radar.start();
  await radar.observePumpMint({
    mint: "mint-1",
    eventSlot: 10,
    venueStage: "pump_curve_active",
    observedAt: NOW.toISOString(),
  });
  assert.equal(alerts.length, 1);
  assert.equal(
    records.some((record) =>
      record.recordType === "narrative_candidate_provider_evidence_failed"),
    true,
  );
  assert.equal(
    records.some((record) => record.recordType === "narrative_alert_delivered"),
    true,
  );
  await radar.stop();
});

function deskMetrics(overrides = {}) {
  return {
    developerPercent: 3,
    insiderPercent: 5,
    bundledPercent: 8,
    freshPercent: 20,
    snipersPercent: 10,
    rugPercent: 0.5,
    phishingPercent: 0,
    botTradingPercent: 95,
    smartMoneyCount: 3,
    holderCount: 60,
    top10Percent: 18,
    marketCapUsd: 40_000,
    volume5mUsd: 20_000,
    netInflow5mUsd: 4_000,
    transactions5m: 100,
    curveFillPercent: 10,
    ...overrides,
  };
}

test("enforces desk law before THE LAWYER ranks or an alert reaches the floor", async () => {
  const records = [];
  const alerts = [];
  const ranked = [];
  let lawyerStopped = false;
  const evidence = {
    schemaVersion: 1,
    observedAt: NOW.toISOString(),
    mint: "mint-1",
    providers: [{
      provider: "gmgn",
      ok: true,
      observation: {},
      capabilities: ["desk_metrics"],
      partialErrors: [],
      error: null,
      runtimeAuthority: false,
    }],
    market: { priceUsd: 0.001, priceProvider: "gmgn", runtimeAuthority: false },
    deskMetrics: {
      source: "gmgn",
      sourceMethodVersion: "test.v1",
      metrics: deskMetrics(),
      missingFields: [],
      invalidFields: [],
      runtimeAuthority: false,
    },
    runtimeAuthority: false,
  };
  const radar = createNarrativeRadar({
    config: config({
      gmgnApiKey: "gmgn-key",
      deskScoutEnabled: true,
      theLawyerStatePath: "/tmp/the-lawyer-test.json",
      narrativeOutcomeTrackingEnabled: false,
    }),
    append: async (record) => { records.push(record); },
    deliver: async (alert) => { alerts.push(alert); return { messageId: 91 }; },
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
    collectPumpStageImpl: async () => ({
      mint: "mint-1",
      venueStage: "pump_curve_active",
      mintAuthority: "renounced",
      freezeAuthority: "renounced",
      source: "helius",
      sourceMethodVersion: "test.v1",
      observedAt: NOW.toISOString(),
      cutoffSlot: 10,
      runtimeAuthority: false,
    }),
    createProviderEnricherImpl: () => ({
      start: async () => ({
        configuredProviders: ["gmgn"],
        providerReadiness: { gmgn: { ok: true } },
        budgets: {},
      }),
      enrich: async () => evidence,
      readPrice: async () => {},
      snapshot: () => ({ configuredProviders: ["gmgn"] }),
      stop: async () => {},
    }),
    createTheLawyerImpl: () => ({
      start: async () => ({
        lawVersion: "desk-filter-law.v1",
        modelVersion: "test-lawyer.v1",
        role: { name: "THE LAWYER" },
        tradingFloorInstructions: ["SCOUT", "RISK", "THE LAWYER"],
      }),
      rank: async (input) => {
        ranked.push(input);
        return {
          candidateId: input.candidateId,
          rankScore: 77,
          modelOutcomes: 4,
          runtimeAuthority: false,
        };
      },
      recordOutcome: async () => ({ learned: false }),
      snapshot: () => ({ modelVersion: "test-lawyer.v1" }),
      stop: async () => { lawyerStopped = true; },
    }),
  });
  await radar.start();
  await radar.observePumpMint({
    mint: "mint-1",
    eventSlot: 10,
    venueStage: "pump_curve_active",
    observedAt: NOW.toISOString(),
  });
  assert.equal(ranked.length, 1);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /desk law: RISK CLEAR · SCOUT PASS · curve/);
  assert.match(alerts[0].body, /THE LAWYER rank: 77\.0\/100/);
  assert.equal(records.some((record) => record.recordType === "desk_filter_decision"), true);
  assert.equal(records.some((record) => record.recordType === "the_lawyer_ranking"), true);
  await radar.stop();
  assert.equal(lawyerStopped, true);
});

test("suppresses a candidate killed by the immutable risk caps", async () => {
  const records = [];
  let rankCalls = 0;
  let alertCalls = 0;
  const radar = createNarrativeRadar({
    config: config({
      gmgnApiKey: "gmgn-key",
      deskScoutEnabled: true,
      theLawyerStatePath: "/tmp/the-lawyer-kill-test.json",
      narrativeOutcomeTrackingEnabled: false,
    }),
    append: async (record) => { records.push(record); },
    deliver: async () => { alertCalls += 1; },
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
    collectPumpStageImpl: async () => ({
      mint: "mint-1",
      venueStage: "pump_curve_active",
      mintAuthority: "renounced",
      freezeAuthority: "renounced",
      runtimeAuthority: false,
    }),
    createProviderEnricherImpl: () => ({
      start: async () => ({ configuredProviders: ["gmgn"], providerReadiness: {}, budgets: {} }),
      enrich: async () => ({
        observedAt: NOW.toISOString(),
        providers: [{ provider: "gmgn", ok: true }],
        market: { priceUsd: 0.001, priceProvider: "gmgn" },
        deskMetrics: {
          source: "gmgn",
          sourceMethodVersion: "test.v1",
          metrics: deskMetrics({ developerPercent: 5.01 }),
          missingFields: [],
          invalidFields: [],
        },
      }),
      readPrice: async () => {},
      snapshot: () => ({}),
      stop: async () => {},
    }),
    createTheLawyerImpl: () => ({
      start: async () => ({
        lawVersion: "desk-filter-law.v1",
        modelVersion: "test.v1",
        role: {},
        tradingFloorInstructions: [],
      }),
      rank: async () => { rankCalls += 1; },
      recordOutcome: async () => {},
      snapshot: () => ({}),
      stop: async () => {},
    }),
  });
  await radar.start();
  await radar.observePumpMint({ mint: "mint-1", eventSlot: 10, observedAt: NOW.toISOString() });
  assert.equal(rankCalls, 0);
  assert.equal(alertCalls, 0);
  assert.equal(radar.state().riskKills, 1);
  assert.equal(
    records.find((record) => record.recordType === "desk_filter_decision")
      .decision.decision,
    "RISK_KILL",
  );
  await radar.stop();
});
