import assert from "node:assert/strict";
import test from "node:test";

import { TtlDeduper } from "../src/core/runtime/ttl-deduper.mjs";

test("expires remembered keys using the injected clock without sliding the TTL", () => {
  let now = 1_000;
  const deduper = new TtlDeduper({
    maxEntries: 2,
    ttlMs: 100,
    now: () => now,
  });

  assert.equal(deduper.remember("event:1"), true);
  assert.equal(deduper.remember("event:1"), false);
  now = 1_099;
  assert.equal(deduper.remember("event:1"), false);
  now = 1_100;
  assert.equal(deduper.remember("event:1"), true);
  assert.equal(deduper.snapshot().expirations, 1);
});

test("evicts the oldest live key before exceeding maxEntries", () => {
  let now = 0;
  const deduper = new TtlDeduper({
    maxEntries: 2,
    ttlMs: 1_000,
    now: () => now,
  });

  assert.equal(deduper.remember("event:1"), true);
  now += 1;
  assert.equal(deduper.remember("event:2"), true);
  now += 1;
  assert.equal(deduper.remember("event:3"), true);

  assert.equal(deduper.size, 2);
  assert.equal(deduper.has("event:1"), false);
  assert.equal(deduper.has("event:2"), true);
  assert.equal(deduper.has("event:3"), true);
  assert.equal(deduper.snapshot().evictions, 1);
});

test("rejects unsafe configuration, keys, and clock values", () => {
  assert.throws(() => new TtlDeduper({ maxEntries: 0, ttlMs: 1 }), /maxEntries/);
  assert.throws(() => new TtlDeduper({ maxEntries: 1, ttlMs: 0 }), /ttlMs/);
  assert.throws(
    () => new TtlDeduper({ maxEntries: 1, ttlMs: 1, now: 42 }),
    /now/,
  );

  const badClock = new TtlDeduper({
    maxEntries: 1,
    ttlMs: 1,
    now: () => Number.NaN,
  });
  assert.throws(() => badClock.remember("event:1"), /finite/);

  const deduper = new TtlDeduper({ maxEntries: 1, ttlMs: 1 });
  assert.throws(() => deduper.remember(""), /non-empty string/);
});

