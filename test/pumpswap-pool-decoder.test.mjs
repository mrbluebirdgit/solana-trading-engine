import assert from "node:assert/strict";
import test from "node:test";

import { decodePumpSwapPoolAccount } from "../src/integrations/pump/decode-pumpswap-pool.mjs";
import {
  NATIVE_SOL_MINT,
  PUMPSWAP_POOL_DISCRIMINATOR,
  PUMPSWAP_PROGRAM_ID,
} from "../src/integrations/pump/program-ids.mjs";
import { decodePublicKey } from "../src/integrations/solana/base58.mjs";

const MINT = "So11111111111111111111111111111111111111112";

function poolBytes() {
  const bytes = new Uint8Array(107);
  bytes.set(PUMPSWAP_POOL_DISCRIMINATOR, 0);
  bytes[8] = 9;
  new DataView(bytes.buffer).setUint16(9, 2, true);
  bytes.set(decodePublicKey(MINT), 43);
  bytes.set(decodePublicKey(NATIVE_SOL_MINT), 75);
  return bytes;
}

test("decodes the official PumpSwap Pool discriminator and mint fields", () => {
  const pool = decodePumpSwapPoolAccount({
    ownerProgramId: PUMPSWAP_PROGRAM_ID,
    data: poolBytes(),
  });
  assert.equal(pool.poolBump, 9);
  assert.equal(pool.index, 2);
  assert.equal(pool.baseMint, MINT);
  assert.equal(pool.quoteMint, NATIVE_SOL_MINT);
});

test("rejects wrong-owner, truncated, and wrong-discriminator pool data", () => {
  assert.throws(
    () => decodePumpSwapPoolAccount({ ownerProgramId: "other", data: poolBytes() }),
    /owner/,
  );
  assert.throws(
    () => decodePumpSwapPoolAccount({ ownerProgramId: PUMPSWAP_PROGRAM_ID, data: new Uint8Array(8) }),
    /truncated/,
  );
  const bytes = poolBytes();
  bytes[0] ^= 0xff;
  assert.throws(
    () => decodePumpSwapPoolAccount({ ownerProgramId: PUMPSWAP_PROGRAM_ID, data: bytes }),
    /discriminator/,
  );
});
