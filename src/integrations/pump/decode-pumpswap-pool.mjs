import { encodeBase58 } from "../solana/base58.mjs";
import {
  PUMPSWAP_POOL_DISCRIMINATOR,
  PUMPSWAP_POOL_LAYOUT_VERSION,
  PUMPSWAP_PROGRAM_ID,
} from "./program-ids.mjs";

const MINIMUM_LENGTH = 107;

function bytesFrom(data) {
  if (data instanceof Uint8Array || Buffer.isBuffer(data)) {
    return new Uint8Array(data);
  }
  throw new TypeError("pool.data must be raw bytes");
}

function publicKey(bytes, offset) {
  return encodeBase58(bytes.subarray(offset, offset + 32));
}

export function decodePumpSwapPoolAccount({ ownerProgramId, data } = {}) {
  if (ownerProgramId !== PUMPSWAP_PROGRAM_ID) {
    throw new TypeError("pool account owner is not the PumpSwap program");
  }
  const bytes = bytesFrom(data);
  if (bytes.length < MINIMUM_LENGTH) {
    throw new TypeError("PumpSwap pool account is truncated");
  }
  if (
    PUMPSWAP_POOL_DISCRIMINATOR.some(
      (expected, index) => bytes[index] !== expected,
    )
  ) {
    throw new TypeError("PumpSwap pool account discriminator is invalid");
  }

  return Object.freeze({
    layoutVersion: PUMPSWAP_POOL_LAYOUT_VERSION,
    poolBump: bytes[8],
    index: new DataView(bytes.buffer, bytes.byteOffset + 9, 2).getUint16(0, true),
    creator: publicKey(bytes, 11),
    baseMint: publicKey(bytes, 43),
    quoteMint: publicKey(bytes, 75),
    byteLength: bytes.length,
  });
}
