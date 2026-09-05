import assert from "node:assert/strict";
import test from "node:test";

import { createObservationLedger } from "../src/core/runtime/observation-ledger.mjs";

test("serializes append-only observation records", async () => {
  const writes = [];
  const opens = [];
  const ledger = createObservationLedger({
    filePath: "/tmp/observer-test/observations.jsonl",
    mkdirImpl: async () => {},
    openImpl: async (file, flags, mode) => {
      opens.push({ file, flags, mode, chmod: null, closed: false });
      return {
        chmod: async (value) => { opens.at(-1).chmod = value; },
        close: async () => { opens.at(-1).closed = true; },
      };
    },
    appendFileImpl: async (file, line, options) => writes.push({ file, line, options }),
  });

  await ledger.ready();
  await Promise.all([
    ledger.append({ sequence: 1, runtimeAuthority: false }),
    ledger.append({ sequence: 2, runtimeAuthority: false }),
  ]);
  assert.deepEqual(writes.map(({ line }) => JSON.parse(line).sequence), [1, 2]);
  assert.equal(writes.every(({ options }) => options.mode === 0o600), true);
  assert.deepEqual(opens, [{
    file: "/tmp/observer-test/observations.jsonl",
    flags: "a",
    mode: 0o600,
    chmod: 0o600,
    closed: true,
  }]);
});

test("readiness rejects an unwritable ledger before event intake starts", async () => {
  const ledger = createObservationLedger({
    filePath: "/tmp/observer-test/observations.jsonl",
    mkdirImpl: async () => {},
    openImpl: async () => { throw new Error("read only"); },
  });
  await assert.rejects(ledger.ready(), /read only/);
});

test("one failed append does not poison all later ledger writes", async () => {
  let calls = 0;
  const written = [];
  const ledger = createObservationLedger({
    filePath: "/tmp/observer-test/observations.jsonl",
    mkdirImpl: async () => {},
    openImpl: async () => ({ chmod: async () => {}, close: async () => {} }),
    appendFileImpl: async (_file, line) => {
      calls += 1;
      if (calls === 1) throw new Error("disk interrupted");
      written.push(JSON.parse(line));
    },
  });

  await ledger.ready();
  await assert.rejects(
    ledger.append({ sequence: 1, runtimeAuthority: false }),
    /disk interrupted/,
  );
  await ledger.append({ sequence: 2, runtimeAuthority: false });
  await ledger.flush();
  assert.deepEqual(written.map(({ sequence }) => sequence), [2]);
});

test("rejects any record without an explicit no-authority marker", () => {
  const ledger = createObservationLedger({ filePath: "/tmp/observations.jsonl" });
  assert.throws(() => ledger.append({}), /runtimeAuthority false/);
});
