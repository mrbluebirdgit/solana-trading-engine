import assert from "node:assert/strict";
import test from "node:test";

import { createNarrativeOutcomeTracker } from "../src/core/narrative/outcome-tracker.mjs";

function memoryStore(initial = { schemaVersion: 1, entries: [] }) {
  let value = structuredClone(initial);
  return {
    factory: () => ({
      load: async () => structuredClone(value),
      save: async (next) => { value = structuredClone(next); },
      flush: async () => {},
    }),
    value: () => structuredClone(value),
  };
}

function fakeTimer() {
  let scheduled = null;
  return {
    set: (callback, delay) => {
      scheduled = { callback, delay };
      return { unref: () => {} };
    },
    clear: () => { scheduled = null; },
    scheduled: () => scheduled,
  };
}

test("records and notifies point-to-point alert outcomes", async () => {
  let now = new Date("2026-09-05T12:00:00.000Z");
  const records = [];
  const alerts = [];
  const store = memoryStore();
  const timer = fakeTimer();
  const tracker = createNarrativeOutcomeTracker({
    statePath: "/tmp/not-used.json",
    checkpointsMs: [60_000, 300_000],
    readPrice: async () => ({
      provider: "birdeye",
      priceUsd: 0.0015,
      observedAt: now.toISOString(),
    }),
    append: async (record) => { records.push(record); },
    deliver: async (alert) => { alerts.push(alert); },
    clock: () => now,
    setTimeoutImpl: timer.set,
    clearTimeoutImpl: timer.clear,
    createStoreImpl: store.factory,
  });
  await tracker.start();
  await tracker.track({
    mint: "MintOne",
    narrativeLabel: "Keyboard Cat",
    tokenName: "Keyboard Cat",
    tokenSymbol: "KCAT",
    alertedAt: now.toISOString(),
    initialPriceUsd: 0.001,
    initialPriceProvider: "birdeye",
  });
  assert.equal(timer.scheduled().delay, 60_000);
  now = new Date("2026-09-05T12:01:00.000Z");
  await tracker.tick();
  const result = records.find((record) => record.recordType === "narrative_alert_outcome");
  assert.equal(result.checkpointLabel, "1m");
  assert.equal(result.returnPercent, 50);
  assert.match(alerts[0].title, /RESULT 1m · UP \+50\.00%/);
  assert.equal(tracker.snapshot().pendingCheckpoints, 1);
  await tracker.stop();
});

test("restores pending checkpoints after a service restart", async () => {
  let now = new Date("2026-09-05T12:00:00.000Z");
  const store = memoryStore();
  const timer = fakeTimer();
  const options = {
    statePath: "/tmp/not-used.json",
    checkpointsMs: [60_000],
    readPrice: async () => ({
      provider: "gmgn",
      priceUsd: 0.0008,
      observedAt: now.toISOString(),
    }),
    append: async () => {},
    deliver: async () => {},
    notify: false,
    clock: () => now,
    setTimeoutImpl: timer.set,
    clearTimeoutImpl: timer.clear,
    createStoreImpl: store.factory,
  };
  const first = createNarrativeOutcomeTracker(options);
  await first.start();
  await first.track({
    mint: "MintTwo",
    narrativeLabel: "Example",
    alertedAt: now.toISOString(),
    initialPriceUsd: 0.001,
    initialPriceProvider: "gmgn",
  });
  await first.stop();
  assert.equal(store.value().entries.length, 1);

  now = new Date("2026-09-05T12:01:01.000Z");
  const second = createNarrativeOutcomeTracker(options);
  await second.start();
  await second.tick();
  assert.equal(second.snapshot().activeAlerts, 0);
  assert.equal(store.value().entries.length, 0);
  await second.stop();
});

test("records that outcome tracking cannot start without an alert-time price", async () => {
  const records = [];
  const store = memoryStore();
  const tracker = createNarrativeOutcomeTracker({
    statePath: "/tmp/not-used.json",
    checkpointsMs: [60_000],
    readPrice: async () => { throw new Error("must not run"); },
    append: async (record) => { records.push(record); },
    notify: false,
    createStoreImpl: store.factory,
  });
  await tracker.start();
  assert.equal(await tracker.track({
    mint: "MintThree",
    narrativeLabel: "Example",
    alertedAt: new Date().toISOString(),
    initialPriceUsd: null,
  }), false);
  assert.equal(records[0].recordType, "narrative_alert_outcome_unavailable");
  assert.equal(tracker.snapshot().pendingCheckpoints, 0);
  await tracker.stop();
});

test("feeds the persisted candidate id and 15-minute result to THE LAWYER", async () => {
  let now = new Date("2026-09-05T12:00:00.000Z");
  const learned = [];
  const store = memoryStore();
  const timer = fakeTimer();
  const tracker = createNarrativeOutcomeTracker({
    statePath: "/tmp/not-used.json",
    checkpointsMs: [900_000],
    readPrice: async () => ({
      provider: "gmgn",
      priceUsd: 0.00125,
      observedAt: now.toISOString(),
    }),
    append: async () => {},
    notify: false,
    onOutcome: async (outcome) => {
      learned.push(outcome);
      return { learned: true };
    },
    clock: () => now,
    setTimeoutImpl: timer.set,
    clearTimeoutImpl: timer.clear,
    createStoreImpl: store.factory,
  });
  await tracker.start();
  await tracker.track({
    mint: "MintLawyer",
    narrativeLabel: "Example",
    alertedAt: now.toISOString(),
    initialPriceUsd: 0.001,
    initialPriceProvider: "gmgn",
    learningCandidateId: "candidate-1",
  });
  assert.equal(store.value().entries[0].learningCandidateId, "candidate-1");
  now = new Date("2026-09-05T12:15:00.000Z");
  await tracker.tick();
  assert.equal(learned.length, 1);
  assert.equal(learned[0].candidateId, "candidate-1");
  assert.equal(learned[0].horizonMs, 900_000);
  assert.equal(learned[0].returnPercent, 25);
  assert.equal(tracker.snapshot().learnedOutcomes, 1);
  await tracker.stop();
});
