import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createDailyRequestBudget } from "../src/core/runtime/daily-request-budget.mjs";

test("persists daily usage and preserves a safety reserve across restarts", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "provider-budget-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = new Date("2026-09-05T12:00:00.000Z");
  const options = {
    provider: "birdeye",
    dailyLimit: 3,
    reserve: 1,
    statePath: path.join(directory, "budget.json"),
    clock: () => now,
  };
  const first = createDailyRequestBudget(options);
  await first.ready();
  assert.equal((await first.take()).ok, true);
  assert.equal((await first.take()).remaining, 0);
  assert.deepEqual(await first.take(), {
    ok: false,
    provider: "birdeye",
    reason: "daily_budget_exhausted",
    blockedUntil: null,
    remaining: 0,
  });

  const restarted = createDailyRequestBudget(options);
  await restarted.ready();
  assert.equal((await restarted.take()).reason, "daily_budget_exhausted");
  now = new Date("2026-09-06T00:00:01.000Z");
  assert.equal((await restarted.take()).ok, true);
  assert.equal(restarted.snapshot().used, 1);
});

test("persists provider backoff and releases it after the deadline", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "provider-backoff-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = new Date("2026-09-05T12:00:00.000Z");
  const options = {
    provider: "gmgn",
    dailyLimit: 10,
    reserve: 1,
    statePath: path.join(directory, "budget.json"),
    clock: () => now,
  };
  const first = createDailyRequestBudget(options);
  await first.ready();
  await first.blockFor(60_000);

  const restarted = createDailyRequestBudget(options);
  await restarted.ready();
  const blocked = await restarted.take();
  assert.equal(blocked.reason, "provider_backoff");
  assert.equal(blocked.blockedUntil, "2026-09-05T12:01:00.000Z");
  now = new Date("2026-09-05T12:01:01.000Z");
  assert.equal((await restarted.take()).ok, true);
});

test("fails closed on corrupted persisted budget state", async () => {
  const store = {
    load: async () => ({ provider: "birdeye", used: -1 }),
    save: async () => {},
    flush: async () => {},
  };
  const budget = createDailyRequestBudget({
    provider: "birdeye",
    dailyLimit: 10,
    reserve: 1,
    statePath: "/tmp/not-used.json",
    createStoreImpl: () => store,
  });
  await assert.rejects(budget.ready(), /state is invalid/);
});

test("persists exponential provider backoff and resets it after success", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "provider-exponential-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = new Date("2026-09-05T12:00:00.000Z");
  const options = {
    provider: "newsapi",
    dailyLimit: 100,
    reserve: 10,
    statePath: path.join(directory, "budget.json"),
    clock: () => now,
  };
  const first = createDailyRequestBudget(options);
  await first.ready();
  await first.backoff({ baseMs: 1_000, maximumMs: 8_000 });
  assert.equal(first.snapshot().consecutiveFailures, 1);
  assert.equal(first.snapshot().blockedUntil, "2026-09-05T12:00:01.000Z");

  now = new Date("2026-09-05T12:00:01.001Z");
  await first.backoff({ baseMs: 1_000, maximumMs: 8_000 });
  assert.equal(first.snapshot().consecutiveFailures, 2);
  assert.equal(first.snapshot().blockedUntil, "2026-09-05T12:00:03.001Z");

  const restarted = createDailyRequestBudget(options);
  await restarted.ready();
  assert.equal(restarted.snapshot().consecutiveFailures, 2);
  now = new Date("2026-09-05T12:00:03.002Z");
  assert.equal((await restarted.take()).ok, true);
  await restarted.succeed();
  assert.equal(restarted.snapshot().consecutiveFailures, 0);
  await restarted.backoff({ baseMs: 1_000, maximumMs: 8_000 });
  assert.equal(restarted.snapshot().blockedUntil, "2026-09-05T12:00:04.002Z");
});
