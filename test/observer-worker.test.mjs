import assert from "node:assert/strict";
import test from "node:test";

import { startObserverWorker } from "../src/core/runtime/observer-worker.mjs";

const config = Object.freeze({
  mode: "observe",
  notify: true,
  includeSwaps: false,
  heliusApiKey: "helius-secret",
  jupiterApiKey: "jupiter-secret",
  notificationChannel: "telegram_bot",
  telegramBotToken: "telegram-secret",
  telegramChatId: "42",
  port: 3000,
  observationLogPath: "/tmp/observer-worker-test.jsonl",
  eventConcurrency: 1,
  maximumQueuedEvents: 2,
  maximumEventAgeMs: 30_000,
  dedupeTtlMs: 60_000,
  maximumDedupeEntries: 10,
});

const healthyProviders = Object.freeze({
  checkHeliusHealthImpl: async () => ({ ok: true }),
  checkJupiterReadAccessImpl: async () => ({ ok: true }),
});

test("persists raw discovery before enrichment and sends an observe-only alert", async () => {
  const records = [];
  const deliveries = [];
  let callbacks;
  let healthClosed = false;
  let observerStopped = false;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config,
    clock: () => new Date("2026-09-04T12:00:00.000Z"),
    sleepImpl: async () => {},
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => { records.push(record); },
      flush: async () => {},
    }),
    startHealthServerImpl: async ({ getState }) => {
      assert.equal(getState().runtimeAuthority, false);
      return { close: async () => { healthClosed = true; } };
    },
    runObserverImpl: async (options) => {
      callbacks = options;
      options.onStatus({ state: "subscribed" });
      return { stop: () => { observerStopped = true; } };
    },
    resolveMintsImpl: async () => ({
      mints: ["mint-1"],
      source: "transaction",
      resolvedEventType: "create",
    }),
    observeOpportunityImpl: async () => ({
      stage: { mint: "mint-1", venueStage: "migration_pending" },
      quotes: { buyPriceImpactPercent: 0.5, sellPriceImpactPercent: 0.8 },
      quoteError: null,
      decision: {
        decision: "ALERT_ONLY",
        notificationEligible: true,
        runtimeAuthority: false,
      },
      alert: { title: "candidate", body: "authority: observe only", priority: "high", runtimeAuthority: false },
      runtimeAuthority: false,
    }),
    deliverTelegramImpl: async (message) => {
      deliveries.push(message);
      return { ok: true };
    },
  });

  const submitted = callbacks.onEvent({
    source: "helius",
    streamVersion: "v1",
    signature: "signature-1",
    slot: 99,
    eventType: "migrate",
    candidateMints: [],
    logs: ["Program log: Instruction: Migrate"],
    err: null,
    runtimeAuthority: false,
  });
  assert.equal(submitted.accepted, true);
  await submitted.promise;
  await worker.waitForIdle();

  assert.deepEqual(records.map(({ recordType }) => recordType), [
    "pump_log_event",
    "opportunity_observation",
  ]);
  assert.equal(records[0].runtimeAuthority, false);
  assert.equal(records[0].classifiedEventType, "migrate");
  assert.equal(records[1].eventType, "create");
  assert.equal(records[1].classifiedEventType, "migrate");
  assert.equal(deliveries.length, 2);
  assert.match(deliveries[0].body, /observe only/);
  assert.match(deliveries[1].body, /ALERT_ONLY/);
  assert.equal(worker.state().observerState, "subscribed");

  await worker.stop();
  assert.equal(observerStopped, true);
  assert.equal(healthClosed, true);
});

test("suppresses generic opportunity alerts when the selective narrative lane is enabled", async () => {
  const deliveries = [];
  let callbacks;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: {
      ...config,
      genericOpportunityAlertsEnabled: false,
    },
    clock: () => new Date("2026-09-04T12:00:00.000Z"),
    sleepImpl: async () => {},
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async () => {},
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      return { stop: () => {} };
    },
    resolveMintsImpl: async () => ({
      mints: ["mint-selective"],
      source: "transaction",
      resolvedEventType: "create",
    }),
    observeOpportunityImpl: async () => ({
      stage: { mint: "mint-selective", venueStage: "migration_pending" },
      quotes: { buyPriceImpactPercent: 0.5, sellPriceImpactPercent: 0.8 },
      quoteError: null,
      decision: { decision: "ALERT_ONLY", runtimeAuthority: false },
      alert: { title: "candidate", body: "observe only", priority: "high" },
      runtimeAuthority: false,
    }),
    deliverTelegramImpl: async (message) => {
      deliveries.push(message);
      return { ok: true };
    },
  });

  const submitted = callbacks.onEvent({
    source: "helius",
    streamVersion: "v1",
    signature: "signature-selective",
    slot: 101,
    eventType: "create",
    candidateMints: [],
    logs: ["Program log: Instruction: Create"],
    err: null,
    runtimeAuthority: false,
  });
  await submitted.promise;
  await worker.waitForIdle();

  // The first delivery is the startup probe. No generic token alert follows.
  assert.equal(deliveries.length, 1);
  await worker.stop();
});

test("starts one integrated narrative radar and forwards resolved Pump mints", async () => {
  const order = [];
  const observedMints = [];
  let callbacks;
  let radarStopped = false;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: {
      ...config,
      notify: false,
      notificationChannel: null,
      narrativeRadarEnabled: true,
    },
    clock: () => new Date("2026-09-04T12:00:00.000Z"),
    sleepImpl: async () => {},
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async () => {},
      flush: async () => {},
    }),
    createNarrativeRadarImpl: ({ append, deliver }) => {
      assert.equal(typeof append, "function");
      assert.equal(typeof deliver, "function");
      return {
        start: async () => { order.push("radar-start"); },
        stop: async () => { radarStopped = true; },
        observePumpMint: async (candidate) => { observedMints.push(candidate); },
        state: () => ({ healthy: true, narrativeCount: 2 }),
      };
    },
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      order.push("chain-listener-start");
      callbacks = options;
      return { stop: () => {} };
    },
    resolveMintsImpl: async () => ({
      mints: ["mint-1"],
      source: "transaction",
      resolvedEventType: "create",
    }),
    observeOpportunityImpl: async () => ({
      stage: { mint: "mint-1", venueStage: "pump_curve_active" },
      quotes: { buyPriceImpactPercent: 0.5, sellPriceImpactPercent: 0.8 },
      quoteError: null,
      decision: { decision: "ALERT_ONLY", runtimeAuthority: false },
      alert: { title: "candidate", body: "observe only", runtimeAuthority: false },
      runtimeAuthority: false,
    }),
  });

  assert.deepEqual(order, ["radar-start", "chain-listener-start"]);
  const submitted = callbacks.onEvent({
    signature: "narrative-create",
    slot: 44,
    eventType: "create",
    logs: ["Program log: Instruction: Create"],
    err: null,
  });
  await submitted.promise;
  await worker.waitForIdle();
  assert.deepEqual(observedMints, [{
    mint: "mint-1",
    eventSlot: 44,
    venueStage: "pump_curve_active",
    observedAt: "2026-09-04T12:00:00.000Z",
  }]);
  assert.equal(worker.state().narrativeHealthy, true);
  assert.equal(worker.state().narrativeCount, 2);
  await worker.stop();
  assert.equal(radarStopped, true);
});

test("routes narrative-only mints without per-event Jupiter opportunity enrichment", async () => {
  const records = [];
  const observedMints = [];
  let callbacks;
  let opportunityCalls = 0;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: {
      ...config,
      notify: false,
      notificationChannel: null,
      narrativeRadarEnabled: true,
      genericOpportunityAlertsEnabled: false,
    },
    clock: () => new Date("2026-09-04T12:00:00.000Z"),
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => { records.push(record); },
      flush: async () => {},
    }),
    createNarrativeRadarImpl: () => ({
      start: async () => {},
      stop: async () => {},
      observePumpMint: async (candidate) => { observedMints.push(candidate); },
      state: () => ({ healthy: true }),
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      options.onStatus({ state: "subscribed" });
      return { stop: () => {} };
    },
    resolveMintsImpl: async () => ({
      mints: ["mint-metered"],
      source: "transaction",
      resolvedEventType: "create",
    }),
    observeOpportunityImpl: async () => {
      opportunityCalls += 1;
      throw new Error("should not be called");
    },
  });

  const submitted = callbacks.onEvent({
    signature: "narrative-metered",
    slot: 46,
    eventType: "create",
    logs: ["Program log: Instruction: Create"],
    err: null,
  });
  await submitted.promise;
  await worker.waitForIdle();
  assert.equal(opportunityCalls, 0);
  assert.deepEqual(observedMints, [{
    mint: "mint-metered",
    eventSlot: 46,
    venueStage: null,
    observedAt: "2026-09-04T12:00:00.000Z",
  }]);
  assert.equal(records.some((record) => record.recordType === "narrative_mint_routed"), true);
  assert.equal(records.some((record) => record.recordType === "opportunity_observation"), false);
  await worker.stop();
});

test("latches narrative mint health closed when an observed mint cannot be enriched", async () => {
  const records = [];
  let callbacks;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: {
      ...config,
      notify: false,
      notificationChannel: null,
      narrativeRadarEnabled: true,
    },
    clock: () => new Date("2026-09-04T12:00:00.000Z"),
    sleepImpl: async () => {},
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => { records.push(record); },
      flush: async () => {},
    }),
    createNarrativeRadarImpl: () => ({
      start: async () => {},
      stop: async () => {},
      observePumpMint: async () => { throw new Error("metadata unavailable"); },
      state: () => ({ healthy: true }),
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      options.onStatus({ state: "subscribed" });
      return { stop: () => {} };
    },
    resolveMintsImpl: async () => ({
      mints: ["mint-gap"],
      source: "transaction",
      resolvedEventType: "create",
    }),
    observeOpportunityImpl: async () => ({
      stage: { mint: "mint-gap", venueStage: "pump_curve_active" },
      quotes: { buyPriceImpactPercent: 0.5, sellPriceImpactPercent: 0.8 },
      quoteError: null,
      decision: { decision: "ALERT_ONLY", runtimeAuthority: false },
      alert: { title: "candidate", body: "observe only", runtimeAuthority: false },
      runtimeAuthority: false,
    }),
  });

  const submitted = callbacks.onEvent({
    signature: "narrative-gap",
    slot: 45,
    eventType: "create",
    logs: ["Program log: Instruction: Create"],
    err: null,
  });
  await submitted.promise;
  await worker.waitForIdle();

  assert.equal(worker.state().narrativeHealthy, true);
  assert.equal(worker.state().narrativeMintHealthy, false);
  assert.equal(worker.state().narrativeFailedMints, 1);
  assert.equal(
    records.some((record) => record.recordType === "narrative_mint_enrichment_failed"),
    true,
  );
  await worker.stop();
});

test("filters swaps by default before writing them", async () => {
  const records = [];
  let callbacks;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: { ...config, notify: false, notificationChannel: null },
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => { records.push(record); },
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      return { stop: () => {} };
    },
  });

  const result = callbacks.onEvent({ signature: "sig", slot: 1, eventType: "swap" });
  assert.equal(result.disposition, "filtered");
  assert.equal(records.length, 0);
  await worker.stop();
});

test("latches and records a malformed target event instead of filtering it", async () => {
  const records = [];
  let callbacks;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: { ...config, notify: false, notificationChannel: null },
    clock: () => new Date("2026-09-04T12:00:00.000Z"),
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => { records.push(record); },
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      options.onStatus({ state: "subscribed" });
      return { stop: () => {} };
    },
  });

  const result = callbacks.onEvent({
    signature: null,
    slot: null,
    eventType: "create",
    err: null,
  });
  assert.equal(result.disposition, "invalid");
  await result.promise;
  assert.equal(worker.state().ingestionHealthy, false);
  assert.equal(worker.state().invalidEvents, 1);
  assert.equal(records[0].recordType, "invalid_stream_event");
  await worker.stop();
});

test("does not advertise readiness when the startup notification probe fails", async () => {
  let callbacks;
  let capturedState;
  const records = [];
  const worker = await startObserverWorker({
    ...healthyProviders,
    config,
    clock: () => new Date("2026-09-04T12:00:00.000Z"),
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => { records.push(record); },
      flush: async () => {},
    }),
    startHealthServerImpl: async ({ getState }) => {
      capturedState = getState;
      return { close: async () => {} };
    },
    runObserverImpl: async (options) => {
      callbacks = options;
      options.onStatus({ state: "subscribed" });
      return { stop: () => {} };
    },
    deliverTelegramImpl: async () => { throw new Error("telegram unavailable"); },
  });

  assert.equal(callbacks !== undefined, true);
  assert.equal(capturedState().storageHealthy, true);
  assert.equal(capturedState().notificationHealthy, false);
  assert.equal(records[0].recordType, "notification_probe_failed");
  await worker.stop();
});

test("fails startup before opening the listener when storage is unavailable", async () => {
  let listenerStarted = false;
  await assert.rejects(
    startObserverWorker({
      ...healthyProviders,
      config,
      logger: { log: () => {}, error: () => {} },
      createLedgerImpl: () => ({
        ready: async () => { throw new Error("read only"); },
        append: async () => {},
        flush: async () => {},
      }),
      startHealthServerImpl: async () => ({ close: async () => {} }),
      runObserverImpl: async () => {
        listenerStarted = true;
        return { stop: () => {} };
      },
    }),
    /ledger readiness probe failed/,
  );
  assert.equal(listenerStarted, false);
});

test("bounds raw persistence with enrichment and counts overload drops", async () => {
  const records = [];
  let callbacks;
  let releaseFirstWrite;
  let firstWriteStarted;
  const firstWriteStartedPromise = new Promise((resolve) => { firstWriteStarted = resolve; });
  const firstWriteGate = new Promise((resolve) => { releaseFirstWrite = resolve; });
  let resolutionCalls = 0;
  let clockTick = 0;

  const worker = await startObserverWorker({
    ...healthyProviders,
    config: {
      ...config,
      notify: false,
      notificationChannel: null,
      maximumQueuedEvents: 1,
    },
    clock: () => new Date(`2026-09-04T12:00:0${clockTick++}.000Z`),
    logger: { log: () => {}, error: () => {} },
    sleepImpl: async () => {},
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => {
        if (record.recordType === "pump_log_event" && record.signature === "signature-1") {
          firstWriteStarted();
          await firstWriteGate;
        }
        records.push(record);
      },
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      return { stop: () => {} };
    },
    resolveMintsImpl: async () => {
      resolutionCalls += 1;
      return { mints: [`mint-${resolutionCalls}`], source: "transaction" };
    },
    observeOpportunityImpl: async () => ({
      stage: { mint: "mint", venueStage: "unknown" },
      quotes: null,
      quoteError: "unavailable",
      decision: { decision: "REJECT", runtimeAuthority: false },
      alert: { title: "candidate", body: "observe only", priority: "default", runtimeAuthority: false },
      runtimeAuthority: false,
    }),
  });

  const event = (sequence) => ({
    signature: `signature-${sequence}`,
    slot: sequence,
    eventType: "create",
    logs: [],
    err: null,
  });
  const first = callbacks.onEvent(event(1));
  await firstWriteStartedPromise;
  const second = callbacks.onEvent(event(2));
  const third = callbacks.onEvent(event(3));

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.equal(third.accepted, false);
  assert.equal(third.disposition, "overloaded");
  assert.equal(worker.state().overloadedEvents, 1);
  assert.equal(records.some((record) => record.signature === "signature-3"), false);

  releaseFirstWrite();
  await worker.waitForIdle();
  const raw = records.filter((record) => record.recordType === "pump_log_event");
  assert.deepEqual(raw.map((record) => record.signature), ["signature-1", "signature-2"]);
  assert.deepEqual(raw.map((record) => record.ingestedAt), [
    "2026-09-04T12:00:00.000Z",
    "2026-09-04T12:00:01.000Z",
  ]);
  await worker.stop();
});

test("closes the health server even after an event ledger write fails", async () => {
  let callbacks;
  let healthClosed = false;
  let appendCalls = 0;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: { ...config, notify: false, notificationChannel: null },
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async () => {
        appendCalls += 1;
        if (appendCalls === 1) throw new Error("disk interrupted");
      },
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({
      close: async () => { healthClosed = true; },
    }),
    runObserverImpl: async (options) => {
      callbacks = options;
      return { stop: () => {} };
    },
  });

  const submitted = callbacks.onEvent({
    signature: "signature-fail",
    slot: 4,
    eventType: "create",
    logs: [],
    err: null,
  });
  await assert.rejects(submitted.promise, /ledger write failed/);
  await worker.stop();
  assert.equal(healthClosed, true);
});

test("fails startup before notification and listener when a provider probe fails", async () => {
  let listenerStarted = false;
  let notificationAttempted = false;
  await assert.rejects(
    startObserverWorker({
      ...healthyProviders,
      config,
      logger: { log: () => {}, error: () => {} },
      checkJupiterReadAccessImpl: async () => { throw new Error("unavailable"); },
      createLedgerImpl: () => ({
        ready: async () => {},
        append: async () => {},
        flush: async () => {},
      }),
      startHealthServerImpl: async () => ({ close: async () => {} }),
      runObserverImpl: async () => {
        listenerStarted = true;
        return { stop: () => {} };
      },
      deliverTelegramImpl: async () => {
        notificationAttempted = true;
        return { ok: true };
      },
    }),
    /provider readiness probe failed/,
  );
  assert.equal(notificationAttempted, false);
  assert.equal(listenerStarted, false);
});

test("marks providers unhealthy when all quote enrichments fail", async () => {
  const records = [];
  let callbacks;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: { ...config, notify: false, notificationChannel: null },
    clock: () => new Date("2026-09-04T12:00:00.000Z"),
    sleepImpl: async () => {},
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => { records.push(record); },
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      options.onStatus({ state: "subscribed" });
      return { stop: () => {} };
    },
    resolveMintsImpl: async () => ({ mints: ["mint-1"], source: "transaction" }),
    observeOpportunityImpl: async () => ({
      stage: { mint: "mint-1", venueStage: "unknown" },
      quotes: null,
      quoteError: "Jupiter unavailable",
      decision: { decision: "REJECT", runtimeAuthority: false },
      alert: { title: "candidate", body: "observe only", priority: "default", runtimeAuthority: false },
      runtimeAuthority: false,
    }),
  });

  const submitted = callbacks.onEvent({
    signature: "quote-failure",
    slot: 5,
    eventType: "create",
    logs: [],
    err: null,
  });
  await submitted.promise;
  await worker.waitForIdle();
  assert.equal(worker.state().providerHealthy, false);
  assert.equal(worker.state().enrichmentHealthy, false);
  assert.equal(
    records.some((record) =>
      record.recordType === "opportunity_observation" &&
      record.enrichmentComplete === false &&
      record.enrichmentFailureReason === "Jupiter unavailable"),
    true,
  );
  assert.equal(
    records.some((record) => record.recordType === "opportunity_observation_failed"),
    false,
  );
  await worker.stop();
});

test("latches a missed enrichment unhealthy after provider recovery", async () => {
  const records = [];
  let callbacks;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: { ...config, notify: false, notificationChannel: null },
    clock: () => new Date("2026-09-04T12:00:00.000Z"),
    sleepImpl: async () => {},
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => { records.push(record); },
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      options.onStatus({ state: "subscribed" });
      return { stop: () => {} };
    },
    resolveMintsImpl: async (_apiKey, event) =>
      event.signature === "missed"
        ? { mints: [], source: "transaction_slot_mismatch" }
        : { mints: ["mint-1"], source: "transaction" },
    observeOpportunityImpl: async () => ({
      stage: { mint: "mint-1", venueStage: "migration_pending" },
      quotes: { buyPriceImpactPercent: 0.5, sellPriceImpactPercent: 0.8 },
      quoteError: null,
      decision: { decision: "ALERT_ONLY", runtimeAuthority: false },
      alert: { title: "candidate", body: "observe only", priority: "high", runtimeAuthority: false },
      runtimeAuthority: false,
    }),
  });

  const missed = callbacks.onEvent({
    signature: "missed",
    slot: 8,
    eventType: "create",
    logs: [],
    err: null,
  });
  await missed.promise;
  await worker.waitForIdle();
  assert.equal(worker.state().providerHealthy, true);
  assert.equal(worker.state().enrichmentHealthy, false);

  const recovered = callbacks.onEvent({
    signature: "recovered",
    slot: 9,
    eventType: "migrate",
    logs: [],
    err: null,
  });
  await recovered.promise;
  await worker.waitForIdle();
  assert.equal(worker.state().providerHealthy, true);
  assert.equal(worker.state().enrichmentHealthy, false);
  assert.equal(
    records.some((record) => record.recordType === "mint_resolution_failed"),
    true,
  );
  await worker.stop();
});

test("treats Jupiter no-route as a candidate abstention, not provider failure", async () => {
  const records = [];
  let callbacks;
  let observationCalls = 0;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: { ...config, notify: false, notificationChannel: null },
    clock: () => new Date("2026-09-04T12:00:00.000Z"),
    sleepImpl: async () => {},
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => { records.push(record); },
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      options.onStatus({ state: "subscribed" });
      return { stop: () => {} };
    },
    resolveMintsImpl: async () => ({ mints: ["mint-1"], source: "transaction" }),
    observeOpportunityImpl: async () => {
      observationCalls += 1;
      return {
        stage: { mint: "mint-1", venueStage: "unknown" },
        quotes: null,
        quoteError: "Jupiter has no route for the requested token and size",
        quoteErrorCode: "route_unavailable",
        quoteErrorScope: "candidate",
        observationOutcome: "candidate_rejection",
        decision: { decision: "REJECT", runtimeAuthority: false },
        alert: { title: "candidate", body: "observe only", priority: "default", runtimeAuthority: false },
        runtimeAuthority: false,
      };
    },
  });

  const submitted = callbacks.onEvent({
    signature: "no-route",
    slot: 10,
    eventType: "create",
    logs: [],
    err: null,
  });
  await submitted.promise;
  await worker.waitForIdle();
  assert.equal(observationCalls, 1);
  assert.equal(worker.state().providerHealthy, true);
  assert.equal(worker.state().enrichmentHealthy, true);
  assert.equal(worker.state().abstainedEvents, 1);
  assert.equal(
    records.some((record) =>
      record.recordType === "opportunity_observation" &&
      record.quoteErrorCode === "route_unavailable"),
    true,
  );
  await worker.stop();
});

test("latches an invalid provider stage snapshot even when quotes succeed", async () => {
  const records = [];
  let callbacks;
  let observationCalls = 0;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: { ...config, notify: false, notificationChannel: null },
    clock: () => new Date("2026-09-04T12:00:00.000Z"),
    sleepImpl: async () => {},
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => { records.push(record); },
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      options.onStatus({ state: "subscribed" });
      return { stop: () => {} };
    },
    resolveMintsImpl: async () => ({ mints: ["mint-1"], source: "transaction" }),
    observeOpportunityImpl: async () => {
      observationCalls += 1;
      return {
        stage: {
          mint: "mint-1",
          venueStage: "unknown",
          abstentionReason: "invalid_rpc_context_slot",
        },
        stageErrorScope: "provider",
        stageErrorRetryable: true,
        quotes: { buyPriceImpactPercent: 0.1, sellPriceImpactPercent: 0.2 },
        quoteError: null,
        quoteErrorScope: null,
        observationOutcome: "provider_failure",
        decision: { decision: "REJECT", runtimeAuthority: false },
        alert: { title: "candidate", body: "observe only", priority: "default", runtimeAuthority: false },
        runtimeAuthority: false,
      };
    },
  });

  const submitted = callbacks.onEvent({
    signature: "invalid-stage-snapshot",
    slot: 11,
    eventType: "create",
    logs: [],
    err: null,
  });
  await submitted.promise;
  await worker.waitForIdle();
  assert.equal(observationCalls, 4);
  assert.equal(worker.state().providerHealthy, false);
  assert.equal(worker.state().enrichmentHealthy, false);
  assert.equal(
    records.some((record) =>
      record.recordType === "opportunity_observation" &&
      record.stageErrorScope === "provider" &&
      record.enrichmentComplete === false),
    true,
  );
  await worker.stop();
});

test("keeps known unsupported Token-2022 stages as candidate abstentions", async () => {
  let callbacks;
  let observationCalls = 0;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: { ...config, notify: false, notificationChannel: null },
    clock: () => new Date("2026-09-04T12:00:00.000Z"),
    sleepImpl: async () => {},
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async () => {},
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      options.onStatus({ state: "subscribed" });
      return { stop: () => {} };
    },
    resolveMintsImpl: async () => ({ mints: ["mint-1"], source: "transaction" }),
    observeOpportunityImpl: async () => {
      observationCalls += 1;
      return {
        stage: {
          mint: "mint-1",
          venueStage: "unknown",
          abstentionReason: "token_2022_extensions_uninspected",
        },
        stageErrorScope: "candidate",
        quotes: { buyPriceImpactPercent: 0.1, sellPriceImpactPercent: 0.2 },
        quoteError: null,
        quoteErrorScope: null,
        observationOutcome: "candidate_rejection",
        decision: { decision: "REJECT", runtimeAuthority: false },
        alert: { title: "candidate", body: "observe only", priority: "default", runtimeAuthority: false },
        runtimeAuthority: false,
      };
    },
  });

  const submitted = callbacks.onEvent({
    signature: "unsupported-token-2022",
    slot: 12,
    eventType: "create",
    logs: [],
    err: null,
  });
  await submitted.promise;
  await worker.waitForIdle();
  assert.equal(observationCalls, 1);
  assert.equal(worker.state().providerHealthy, true);
  assert.equal(worker.state().enrichmentHealthy, true);
  assert.equal(worker.state().abstainedEvents, 1);
  await worker.stop();
});

test("skips enrichment when canonical transaction block time is stale", async () => {
  const records = [];
  let callbacks;
  let observeCalls = 0;
  const nowMs = new Date("2026-09-04T12:00:00.000Z").valueOf();
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: { ...config, notify: false, notificationChannel: null },
    clock: () => new Date(nowMs),
    sleepImpl: async () => {},
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => { records.push(record); },
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      return { stop: () => {} };
    },
    resolveMintsImpl: async () => ({
      mints: ["mint-1"],
      source: "transaction",
      blockTime: Math.floor((nowMs - 31_000) / 1_000),
    }),
    observeOpportunityImpl: async () => {
      observeCalls += 1;
      return null;
    },
  });

  const submitted = callbacks.onEvent({
    signature: "stale-block-time",
    slot: 10,
    eventType: "create",
    logs: [],
    err: null,
  });
  await submitted.promise;
  await worker.waitForIdle();
  assert.equal(observeCalls, 0);
  assert.equal(worker.state().enrichmentHealthy, false);
  assert.equal(
    records.some((record) =>
      record.recordType === "enrichment_skipped" &&
      record.reason === "stale_transaction_block_time"),
    true,
  );
  await worker.stop();
});

test("suppresses an alert when enrichment makes the trigger stale", async () => {
  const records = [];
  const deliveries = [];
  let callbacks;
  let nowMs = new Date("2026-09-04T12:00:00.000Z").valueOf();
  const worker = await startObserverWorker({
    ...healthyProviders,
    config,
    clock: () => new Date(nowMs),
    sleepImpl: async () => {},
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => { records.push(record); },
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      return { stop: () => {} };
    },
    resolveMintsImpl: async () => ({ mints: ["mint-1"], source: "transaction" }),
    observeOpportunityImpl: async () => {
      nowMs += 31_000;
      return {
        stage: { mint: "mint-1", venueStage: "migration_pending" },
        quotes: { buyPriceImpactPercent: 0.5, sellPriceImpactPercent: 0.8 },
        quoteError: null,
        decision: {
          decision: "ALERT_ONLY",
          notificationEligible: true,
          runtimeAuthority: false,
        },
        alert: { title: "candidate", body: "observe only", priority: "high", runtimeAuthority: false },
        runtimeAuthority: false,
      };
    },
    deliverTelegramImpl: async (message) => {
      deliveries.push(message);
      return { ok: true };
    },
  });

  const submitted = callbacks.onEvent({
    signature: "stale-alert",
    slot: 6,
    eventType: "migrate",
    logs: [],
    err: null,
  });
  await submitted.promise;
  await worker.waitForIdle();
  assert.equal(deliveries.length, 1, "only the startup probe should be delivered");
  assert.equal(
    records.some((record) =>
      record.recordType === "alert_suppressed" &&
      record.reason === "stale_trigger_after_enrichment"),
    true,
  );
  assert.equal(worker.state().enrichmentHealthy, false);
  await worker.stop();
});

test("shutdown aborts active enrichment before closing health", async () => {
  let callbacks;
  let resolutionStarted;
  let healthClosed = false;
  const resolutionStartedPromise = new Promise((resolve) => {
    resolutionStarted = resolve;
  });
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: { ...config, notify: false, notificationChannel: null },
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async () => {},
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({
      close: async () => { healthClosed = true; },
    }),
    runObserverImpl: async (options) => {
      callbacks = options;
      return { stop: () => {} };
    },
    resolveMintsImpl: async (_apiKey, _event, { signal }) => {
      resolutionStarted();
      await new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    },
  });

  const submitted = callbacks.onEvent({
    signature: "shutdown-active",
    slot: 7,
    eventType: "create",
    logs: [],
    err: null,
  });
  await submitted.promise;
  await resolutionStartedPromise;
  await worker.stop();
  assert.equal(healthClosed, true);
  assert.equal(worker.state().observerState, "stopped");
});

test("latches readiness and records each distinct post-subscription stream gap", async () => {
  const records = [];
  let callbacks;
  const worker = await startObserverWorker({
    ...healthyProviders,
    config: { ...config, notify: false, notificationChannel: null },
    clock: () => new Date("2026-09-04T12:00:00.000Z"),
    logger: { log: () => {}, error: () => {} },
    createLedgerImpl: () => ({
      ready: async () => {},
      append: async (record) => { records.push(record); },
      flush: async () => {},
    }),
    startHealthServerImpl: async () => ({ close: async () => {} }),
    runObserverImpl: async (options) => {
      callbacks = options;
      options.onStatus({ state: "subscribed" });
      return { stop: () => {} };
    },
  });

  callbacks.onStatus({ state: "closed" });
  callbacks.onStatus({ state: "reconnecting" });
  callbacks.onStatus({ state: "subscribed" });
  callbacks.onStatus({ state: "error" });
  callbacks.onStatus({ state: "reconnecting" });
  await Promise.resolve();
  assert.equal(await worker.fatal, "closed");
  assert.equal(worker.state().observerState, "reconnecting");
  assert.equal(worker.state().ingestionHealthy, false);
  assert.equal(
    records.filter((record) => record.recordType === "stream_gap").length,
    2,
  );
  await worker.stop();
});
