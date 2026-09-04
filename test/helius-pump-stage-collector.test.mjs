import assert from "node:assert/strict";
import test from "node:test";

import { collectPumpStageFromHelius } from "../src/integrations/helius/pump-stage-collector.mjs";
import { heliusRpcRequest } from "../src/integrations/helius/rpc.mjs";
import { bondingCurveAddress } from "../src/integrations/pump/addresses.mjs";
import {
  PUMP_GLOBAL_ACCOUNT,
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
} from "../src/integrations/pump/program-ids.mjs";
import { findProgramAddress } from "../src/integrations/solana/pda.mjs";

const API_KEY = "01234567-89ab-cdef-0123-456789abcdef";
const MINT = "So11111111111111111111111111111111111111112";

function writeU64(bytes, offset, value) {
  new DataView(bytes.buffer, offset, 8).setBigUint64(0, BigInt(value), true);
}

function curveAccountData({ complete = false } = {}) {
  const bytes = new Uint8Array(115);
  writeU64(bytes, 8, 1n);
  writeU64(bytes, 16, 1n);
  writeU64(bytes, 24, complete ? 0n : 100n);
  writeU64(bytes, 32, 1n);
  writeU64(bytes, 40, 200n);
  bytes[48] = complete ? 1 : 0;
  return Buffer.from(bytes).toString("base64");
}

function mintAccountData({ mintActive = true, freezeActive = false } = {}) {
  const bytes = new Uint8Array(82);
  bytes[0] = mintActive ? 1 : 0;
  bytes[46] = freezeActive ? 1 : 0;
  bytes[44] = 6;
  bytes[45] = 1;
  return Buffer.from(bytes).toString("base64");
}

function rpcResult(accounts, slot = 370_000_123) {
  return {
    ok: true,
    json: async () => ({
      jsonrpc: "2.0",
      id: 1,
      result: {
        context: { slot },
        value: accounts,
      },
    }),
  };
}

test("derives the official Pump global account", () => {
  const derived = findProgramAddress(["global"], PUMP_PROGRAM_ID);
  assert.equal(derived.address, PUMP_GLOBAL_ACCOUNT);
});

test("derives a bonding-curve PDA for a 32-byte mint", () => {
  const derived = bondingCurveAddress(MINT);
  assert.equal(typeof derived.address, "string");
  assert.equal(derived.address.length >= 32, true);
});

test("collects pump_curve_active from mocked Helius accounts", async () => {
  const observation = await collectPumpStageFromHelius(API_KEY, MINT, {
    now: () => new Date("2026-09-04T06:20:00.000Z"),
    fetchImpl: async () =>
      rpcResult([
        { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: [mintAccountData(), "base64"] },
        { owner: PUMP_PROGRAM_ID, data: [curveAccountData({ complete: false }), "base64"] },
        null,
      ]),
  });

  assert.equal(observation.venueStage, "pump_curve_active");
  assert.equal(observation.source, "helius");
  assert.equal(observation.cutoffSlot, 370_000_123);
  assert.equal(observation.mintAuthority, "active");
  assert.equal(observation.freezeAuthority, "renounced");
  assert.equal(observation.runtimeAuthority, false);
  assert.equal(observation.canonicalPoolPresent, false);
});

test("collects migration_pending when the curve is complete and the pool is absent", async () => {
  const observation = await collectPumpStageFromHelius(API_KEY, MINT, {
    fetchImpl: async () =>
      rpcResult([
        { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: [mintAccountData({ mintActive: false }), "base64"] },
        { owner: PUMP_PROGRAM_ID, data: [curveAccountData({ complete: true }), "base64"] },
        null,
      ]),
  });

  assert.equal(observation.venueStage, "migration_pending");
  assert.equal(observation.curveComplete, true);
  assert.equal(observation.mintAuthority, "renounced");
});

test("collects pumpswap_amm when the canonical pool account exists", async () => {
  const observation = await collectPumpStageFromHelius(API_KEY, MINT, {
    fetchImpl: async () =>
      rpcResult([
        { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: [mintAccountData(), "base64"] },
        { owner: PUMP_PROGRAM_ID, data: [curveAccountData({ complete: true }), "base64"] },
        { owner: PUMPSWAP_PROGRAM_ID, data: [Buffer.alloc(100).toString("base64"), "base64"] },
      ]),
  });

  assert.equal(observation.venueStage, "pumpswap_amm");
  assert.equal(observation.canonicalPoolPresent, true);
});

test("does not put the Helius key in RPC error messages", async () => {
  await assert.rejects(
    heliusRpcRequest(API_KEY, "getHealth", [], {
      fetchImpl: async () => ({ ok: false, status: 401 }),
    }),
    (error) => {
      assert.match(error.message, /HTTP 401/);
      assert.equal(error.message.includes(API_KEY), false);
      return true;
    },
  );
});
