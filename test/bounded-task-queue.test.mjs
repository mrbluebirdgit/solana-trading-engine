import assert from "node:assert/strict";
import test from "node:test";

import { BoundedTaskQueue } from "../src/core/runtime/bounded-task-queue.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("caps running and queued work and reports overload synchronously", async () => {
  const queue = new BoundedTaskQueue({ concurrency: 2, maxQueued: 1 });
  const gates = [deferred(), deferred(), deferred()];
  let running = 0;
  let peakRunning = 0;
  const task = (gate, value) => async () => {
    running += 1;
    peakRunning = Math.max(peakRunning, running);
    await gate.promise;
    running -= 1;
    return value;
  };

  const first = queue.submit(task(gates[0], "first"));
  const second = queue.submit(task(gates[1], "second"));
  const third = queue.submit(task(gates[2], "third"));
  const rejected = queue.submit(async () => "never");

  assert.equal(first.disposition, "running");
  assert.equal(second.disposition, "running");
  assert.equal(third.disposition, "queued");
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.disposition, "overloaded");
  assert.equal(rejected.promise, null);
  assert.deepEqual(
    { running: queue.snapshot().running, queued: queue.snapshot().queued },
    { running: 2, queued: 1 },
  );

  await Promise.resolve();
  assert.equal(peakRunning, 2);
  gates[0].resolve();
  assert.equal(await first.promise, "first");
  await Promise.resolve();
  assert.equal(peakRunning, 2);

  gates[1].resolve();
  gates[2].resolve();
  assert.equal(await second.promise, "second");
  assert.equal(await third.promise, "third");
  await queue.waitForIdle();

  assert.equal(queue.idle, true);
  assert.equal(queue.snapshot().overloaded, 1);
  assert.equal(queue.snapshot().completed, 3);
});

test("a rejected task does not stall queued work", async () => {
  const queue = new BoundedTaskQueue({ concurrency: 1, maxQueued: 1 });
  const failed = queue.submit(async () => {
    throw new Error("task failed");
  });
  const next = queue.submit(async () => "completed");

  await assert.rejects(failed.promise, /task failed/);
  assert.equal(await next.promise, "completed");
  await queue.waitForIdle();
  assert.equal(queue.snapshot().failed, 1);
  assert.equal(queue.snapshot().completed, 1);
});

test("drain closes intake and resolves only after running and queued work settles", async () => {
  const queue = new BoundedTaskQueue({ concurrency: 1, maxQueued: 1 });
  const firstGate = deferred();
  const secondGate = deferred();
  const first = queue.submit(() => firstGate.promise);
  const second = queue.submit(() => secondGate.promise);

  const drained = queue.drain();
  assert.equal(queue.accepting, false);
  assert.equal(queue.snapshot().draining, true);
  assert.strictEqual(queue.waitForIdle(), drained);

  const afterClose = queue.submit(async () => "never");
  assert.equal(afterClose.accepted, false);
  assert.equal(afterClose.disposition, "closed");

  firstGate.resolve("first");
  assert.equal(await first.promise, "first");
  secondGate.resolve("second");
  assert.equal(await second.promise, "second");

  const finalState = await drained;
  assert.equal(finalState.idle, true);
  assert.equal(finalState.accepting, false);
  assert.equal(finalState.draining, false);
});

test("validates queue limits and submitted tasks", () => {
  assert.throws(() => new BoundedTaskQueue({ concurrency: 0, maxQueued: 1 }), /concurrency/);
  assert.throws(() => new BoundedTaskQueue({ concurrency: 1, maxQueued: -1 }), /maxQueued/);

  const queue = new BoundedTaskQueue({ concurrency: 1, maxQueued: 0 });
  assert.throws(() => queue.submit(null), /task must be a function/);
});

test("discardQueued rejects waiting work while allowing active work to finish", async () => {
  const queue = new BoundedTaskQueue({ concurrency: 1, maxQueued: 2 });
  const gate = deferred();
  const running = queue.submit(() => gate.promise);
  const waitingOne = queue.submit(async () => "one");
  const waitingTwo = queue.submit(async () => "two");

  const discarded = queue.discardQueued("shutdown");
  assert.equal(discarded.discarded, 2);
  await assert.rejects(waitingOne.promise, /shutdown/);
  await assert.rejects(waitingTwo.promise, /shutdown/);
  gate.resolve("done");
  assert.equal(await running.promise, "done");
  await queue.waitForIdle();
  assert.equal(queue.snapshot().cancelled, 2);
});
