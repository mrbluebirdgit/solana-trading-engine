import assert from "node:assert/strict";
import test from "node:test";

import {
  extractPumpInstructionMints,
  pumpInstructionMintLayouts,
  resolveEventMints,
} from "../src/integrations/helius/resolve-event-mints.mjs";
import { PUMP_PROGRAM_ID } from "../src/integrations/pump/program-ids.mjs";
import { encodeBase58 } from "../src/integrations/solana/base58.mjs";

const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const OTHER_MINT = "9xQeWvG816bUx9EPfHMqzUGvAcbW4a3hRZLzaQ5XrS1";

function instruction(eventType, mint, variant = 0) {
  const layouts = pumpInstructionMintLayouts.filter(
    (candidate) => candidate.eventType === eventType,
  );
  const layout = layouts[variant];
  const accounts = Array.from(
    { length: layout.mintAccountIndex + 1 },
    () => OTHER_MINT,
  );
  accounts[layout.mintAccountIndex] = mint;
  return {
    programId: PUMP_PROGRAM_ID,
    accounts,
    data: encodeBase58(Uint8Array.from([...layout.discriminator, 1, 2, 3])),
  };
}

function transaction(instructions, extraMeta = {}) {
  return {
    slot: 99,
    blockTime: 1_788_523_200,
    transaction: { message: { accountKeys: [], instructions } },
    meta: {
      err: null,
      postTokenBalances: [{ mint: OTHER_MINT }],
      ...extraMeta,
    },
  };
}

test("uses a mint only when the event marks it as Pump-instruction scoped", async () => {
  const resolved = await resolveEventMints("key", {
    signature: "sig",
    eventType: "create",
    candidateMints: [MINT],
    candidateMintScope: "pump_instruction",
  });
  assert.deepEqual(resolved.mints, [MINT]);
  assert.equal(resolved.source, "event_pump_instruction");
});

test("extracts create and migrate base mints from official instruction layouts", () => {
  for (const [eventType, variant] of [
    ["create", 0],
    ["create", 1],
    ["migrate", 0],
    ["migrate", 1],
  ]) {
    assert.deepEqual(
      extractPumpInstructionMints(
        transaction([instruction(eventType, MINT, variant)]),
        eventType,
      ),
      [MINT],
    );
  }
});

test("loads only the instruction-scoped mint from getTransaction", async () => {
  const resolved = await resolveEventMints(
    "key",
    { signature: "sig", slot: 99, candidateMints: [], eventType: "migrate" },
    {
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body);
        assert.equal(body.method, "getTransaction");
        assert.equal(body.params[0], "sig");
        return {
          ok: true,
          json: async () => ({
            result: transaction([instruction("migrate", MINT)], {
              postTokenBalances: [{ mint: MINT }, { mint: OTHER_MINT }],
            }),
          }),
        };
      },
    },
  );
  assert.deepEqual(resolved.mints, [MINT]);
  assert.equal(resolved.source, "getTransaction_pump_instruction");
  assert.equal(resolved.resolvedEventType, "migrate");
});

test("uses the supported Pump instruction when transaction-wide logs are misleading", async () => {
  const resolved = await resolveEventMints(
    "key",
    { signature: "sig", slot: 99, eventType: "migrate" },
    {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ result: transaction([instruction("create", MINT)]) }),
      }),
    },
  );
  assert.deepEqual(resolved.mints, [MINT]);
  assert.equal(resolved.resolvedEventType, "create");
});

test("rejects unrelated or malformed instructions and fans out valid lifecycle targets", async () => {
  assert.deepEqual(
    extractPumpInstructionMints(
      transaction([
        { ...instruction("create", MINT), programId: OTHER_MINT },
        { ...instruction("create", MINT), data: "not-base58!" },
      ]),
      "create",
    ),
    [],
  );

  const resolved = await resolveEventMints(
    "key",
    { signature: "sig", slot: 99, eventType: "create", candidateMints: [MINT] },
    {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          result: transaction([
            instruction("create", MINT),
            instruction("create", OTHER_MINT),
          ]),
        }),
      }),
    },
  );
  assert.deepEqual(resolved.mints, [MINT, OTHER_MINT]);
  assert.equal(resolved.source, "getTransaction_pump_instructions");
  assert.deepEqual(resolved.targets, [
    { mint: MINT, eventTypes: ["create"] },
    { mint: OTHER_MINT, eventTypes: ["create"] },
  ]);
});

test("returns structured targets for multiple supported Pump lifecycle instructions", async () => {
  const resolved = await resolveEventMints(
    "key",
    { signature: "sig", slot: 99, eventType: "create" },
    {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          result: transaction([
            instruction("create", MINT),
            instruction("migrate", MINT),
          ]),
        }),
      }),
    },
  );
  assert.deepEqual(resolved.mints, [MINT]);
  assert.equal(resolved.source, "getTransaction_pump_instruction");
  assert.deepEqual(resolved.targets, [
    { mint: MINT, eventTypes: ["create", "migrate"] },
  ]);
  assert.equal(resolved.resolvedEventType, null);
});

test("abstains when transaction slot, status, or block time is not trustworthy", async () => {
  const cases = [
    { tx: { ...transaction([instruction("create", MINT)]), slot: 100 }, source: "transaction_slot_mismatch" },
    { tx: { ...transaction([instruction("create", MINT)]), meta: { err: { code: 1 } } }, source: "transaction_failed" },
    { tx: { ...transaction([instruction("create", MINT)]), blockTime: null }, source: "transaction_block_time_unresolved" },
  ];
  for (const { tx, source } of cases) {
    const resolved = await resolveEventMints(
      "key",
      { signature: "sig", slot: 99, eventType: "create" },
      { fetchImpl: async () => ({ ok: true, json: async () => ({ result: tx }) }) },
    );
    assert.deepEqual(resolved.mints, []);
    assert.equal(resolved.source, source);
  }
});
