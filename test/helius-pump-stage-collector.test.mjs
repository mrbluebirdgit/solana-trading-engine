import assert from "node:assert/strict";
import test from "node:test";

import { collectPumpStageFromHelius } from "../src/integrations/helius/pump-stage-collector.mjs";
import { heliusRpcRequest } from "../src/integrations/helius/rpc.mjs";
import {
  bondingCurveAddress,
  canonicalPumpSwapPoolAddress,
} from "../src/integrations/pump/addresses.mjs";
import {
  PUMP_GLOBAL_ACCOUNT,
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
  BONDING_CURVE_DISCRIMINATOR,
  NATIVE_SOL_MINT,
  PUMPSWAP_POOL_DISCRIMINATOR,
  PUMP_IDL_REFERENCE_COMMIT,
} from "../src/integrations/pump/program-ids.mjs";
import { findProgramAddress } from "../src/integrations/solana/pda.mjs";
import { decodePublicKey } from "../src/integrations/solana/base58.mjs";

const API_KEY = "01234567-89ab-cdef-0123-456789abcdef";
const MINT = "So11111111111111111111111111111111111111112";

function writeU64(bytes, offset, value) {
  new DataView(bytes.buffer, offset, 8).setBigUint64(0, BigInt(value), true);
}

function curveAccountData({ complete = false } = {}) {
  const bytes = new Uint8Array(115);
  bytes.set(BONDING_CURVE_DISCRIMINATOR, 0);
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

function poolAccountData({ baseMint = MINT, quoteMint = NATIVE_SOL_MINT } = {}) {
  const canonical = canonicalPumpSwapPoolAddress(baseMint, quoteMint);
  const bytes = new Uint8Array(107);
  bytes.set(PUMPSWAP_POOL_DISCRIMINATOR, 0);
  bytes[8] = canonical.bump;
  new DataView(bytes.buffer).setUint16(9, canonical.index, true);
  bytes.set(decodePublicKey(canonical.poolAuthority), 11);
  bytes.set(decodePublicKey(baseMint), 43);
  bytes.set(decodePublicKey(quoteMint), 75);
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
  assert.equal(observation.commitment, "confirmed");
  assert.equal(observation.idlReferenceCommit, PUMP_IDL_REFERENCE_COMMIT);
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
        { owner: PUMPSWAP_PROGRAM_ID, data: [poolAccountData(), "base64"] },
      ]),
  });

  assert.equal(observation.venueStage, "pumpswap_amm");
  assert.equal(observation.canonicalPoolPresent, true);
});

test("abstains when PumpSwap pool data does not match the canonical mint", async () => {
  const observation = await collectPumpStageFromHelius(API_KEY, MINT, {
    fetchImpl: async () =>
      rpcResult([
        { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: [mintAccountData(), "base64"] },
        { owner: PUMP_PROGRAM_ID, data: [curveAccountData({ complete: true }), "base64"] },
        { owner: PUMPSWAP_PROGRAM_ID, data: [poolAccountData({ baseMint: PUMP_GLOBAL_ACCOUNT }), "base64"] },
      ]),
  });

  assert.equal(observation.venueStage, "unknown");
  assert.equal(observation.abstentionReason, "canonical_pool_base_mint_mismatch");
});

test("abstains when the mint account is not owned by a token program", async () => {
  const observation = await collectPumpStageFromHelius(API_KEY, MINT, {
    fetchImpl: async () =>
      rpcResult([
        { owner: "11111111111111111111111111111111", data: [mintAccountData(), "base64"] },
        { owner: PUMP_PROGRAM_ID, data: [curveAccountData({ complete: false }), "base64"] },
        null,
      ]),
  });

  assert.equal(observation.venueStage, "unknown");
  assert.equal(observation.abstentionReason, "mint_account_owner_mismatch");
});

test("abstains when the canonical pool address is owned by another program", async () => {
  const observation = await collectPumpStageFromHelius(API_KEY, MINT, {
    fetchImpl: async () =>
      rpcResult([
        { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: [mintAccountData(), "base64"] },
        { owner: PUMP_PROGRAM_ID, data: [curveAccountData({ complete: true }), "base64"] },
        { owner: "11111111111111111111111111111111", data: [Buffer.alloc(100).toString("base64"), "base64"] },
      ]),
  });

  assert.equal(observation.venueStage, "unknown");
  assert.equal(observation.abstentionReason, "canonical_pool_owner_mismatch");
});

test("sets the event slot as the lower bound for the current-state snapshot", async () => {
  let configuration;
  await collectPumpStageFromHelius(API_KEY, MINT, {
    minContextSlot: 370_000_000,
    fetchImpl: async (_url, init) => {
      configuration = JSON.parse(init.body).params[1];
      return rpcResult([
        { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: [mintAccountData(), "base64"] },
        { owner: PUMP_PROGRAM_ID, data: [curveAccountData({ complete: false }), "base64"] },
        null,
      ]);
    },
  });
  assert.equal(configuration.minContextSlot, 370_000_000);
});

test("re-reads mint, curve, and actual pool in one coherent non-SOL snapshot", async () => {
  let calls = 0;
  const nonSolQuoteMint = PUMP_GLOBAL_ACCOUNT;
  const observation = await collectPumpStageFromHelius(API_KEY, MINT, {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        const curveData = Buffer.from(curveAccountData({ complete: true }), "base64");
        curveData.set(decodePublicKey(nonSolQuoteMint), 83);
        return rpcResult([
          { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: [mintAccountData(), "base64"] },
          { owner: PUMP_PROGRAM_ID, data: [curveData.toString("base64"), "base64"] },
          null,
        ], 370_000_123);
      }
      const curveData = Buffer.from(curveAccountData({ complete: true }), "base64");
      curveData.set(decodePublicKey(nonSolQuoteMint), 83);
      return rpcResult([
        { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: [mintAccountData(), "base64"] },
        { owner: PUMP_PROGRAM_ID, data: [curveData.toString("base64"), "base64"] },
        null,
      ], 370_000_124);
    },
  });

  assert.equal(observation.venueStage, "migration_pending");
  assert.equal(observation.cutoffSlot, 370_000_124);
  assert.deepEqual(observation.sourceSlots, [370_000_123, 370_000_124]);
});

test("abstains when a provider omits the context slot", async () => {
  const observation = await collectPumpStageFromHelius(API_KEY, MINT, {
    fetchImpl: async () => rpcResult([
      { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: [mintAccountData(), "base64"] },
      { owner: PUMP_PROGRAM_ID, data: [curveAccountData({ complete: false }), "base64"] },
      null,
    ], null),
  });
  assert.equal(observation.venueStage, "unknown");
  assert.equal(observation.abstentionReason, "invalid_rpc_context_slot");
  assert.equal(observation.cutoffSlot, null);
});

test("rejects a short account response instead of inventing absent accounts", async () => {
  await assert.rejects(
    collectPumpStageFromHelius(API_KEY, MINT, {
      fetchImpl: async () => rpcResult([
        { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: [mintAccountData(), "base64"] },
      ]),
    }),
    /length does not match/,
  );
});

test("abstains when canonical pool relation fields do not match", async () => {
  const invalidPool = Buffer.from(poolAccountData(), "base64");
  invalidPool[9] = 1;
  const observation = await collectPumpStageFromHelius(API_KEY, MINT, {
    fetchImpl: async () => rpcResult([
      { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: [mintAccountData(), "base64"] },
      { owner: PUMP_PROGRAM_ID, data: [curveAccountData({ complete: true }), "base64"] },
      { owner: PUMPSWAP_PROGRAM_ID, data: [invalidPool.toString("base64"), "base64"] },
    ]),
  });
  assert.equal(observation.venueStage, "unknown");
  assert.equal(observation.abstentionReason, "canonical_pool_index_mismatch");
});

test("rejects a malformed event-slot lower bound", async () => {
  await assert.rejects(
    collectPumpStageFromHelius(API_KEY, MINT, { minContextSlot: -1 }),
    /minContextSlot/,
  );
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
