import { encodeBase58 } from "./base58.mjs";
import {
  NATIVE_SOL_MINT,
  BONDING_CURVE_DISCRIMINATOR,
  PUMP_ACCOUNT_LAYOUT_VERSION,
  PUMP_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
} from "./program-ids.mjs";

const DISCRIMINATOR_LENGTH = 8;
const MIN_COMPLETE_LENGTH = 49;
const CREATOR_END = 81;
const QUOTE_MINT_OFFSET = 83;
const QUOTE_MINT_END = 115;

function asBytes(data, field = "accountData") {
  if (data instanceof Uint8Array) return data;
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (trimmed.length === 0) {
      throw new TypeError(`${field} must not be empty`);
    }
    try {
      return Uint8Array.from(Buffer.from(trimmed, "base64"));
    } catch {
      throw new TypeError(`${field} must be base64 or raw bytes`);
    }
  }
  throw new TypeError(`${field} must be bytes or base64`);
}

function readU64(bytes, offset, field) {
  if (bytes.length < offset + 8) {
    throw new TypeError(`${field} is truncated`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return view.getBigUint64(0, true);
}

function readPubkey(bytes, offset, field) {
  if (bytes.length < offset + 32) {
    return null;
  }
  return encodeBase58(bytes.subarray(offset, offset + 32));
}

function normalizeQuoteMint(rawQuoteMint) {
  if (rawQuoteMint === null || rawQuoteMint === SYSTEM_PROGRAM_ID) {
    return NATIVE_SOL_MINT;
  }
  return rawQuoteMint;
}

export function decodeBondingCurveAccount(input) {
  const ownerProgramId =
    typeof input?.ownerProgramId === "string" ? input.ownerProgramId.trim() : "";
  if (ownerProgramId && ownerProgramId !== PUMP_PROGRAM_ID) {
    throw new TypeError("bonding-curve account owner is not the Pump program");
  }

  const bytes = asBytes(input?.data ?? input, "bondingCurve.data");
  if (bytes.length < MIN_COMPLETE_LENGTH) {
    throw new TypeError("bonding-curve account is shorter than the complete flag");
  }
  if (
    BONDING_CURVE_DISCRIMINATOR.some(
      (expected, index) => bytes[index] !== expected,
    )
  ) {
    throw new TypeError("bonding-curve account discriminator is invalid");
  }

  const complete = bytes[48] === 1;
  if (bytes[48] > 1) {
    throw new TypeError("bonding-curve complete flag is not a boolean");
  }

  const creator = bytes.length >= CREATOR_END ? readPubkey(bytes, 49, "creator") : null;
  const quoteMintRaw =
    bytes.length >= QUOTE_MINT_END ? readPubkey(bytes, QUOTE_MINT_OFFSET, "quoteMint") : null;

  return Object.freeze({
    layoutVersion: PUMP_ACCOUNT_LAYOUT_VERSION,
    ownerProgramId: ownerProgramId || PUMP_PROGRAM_ID,
    virtualTokenReserves: readU64(bytes, DISCRIMINATOR_LENGTH, "virtualTokenReserves"),
    virtualQuoteReserves: readU64(bytes, 16, "virtualQuoteReserves"),
    realTokenReserves: readU64(bytes, 24, "realTokenReserves"),
    realQuoteReserves: readU64(bytes, 32, "realQuoteReserves"),
    tokenTotalSupply: readU64(bytes, 40, "tokenTotalSupply"),
    complete,
    creator,
    isMayhemMode: bytes.length > 81 ? bytes[81] === 1 : null,
    isCashbackCoin: bytes.length > 82 ? bytes[82] === 1 : null,
    quoteMint: normalizeQuoteMint(quoteMintRaw),
    quoteMintExplicit: quoteMintRaw !== null && quoteMintRaw !== SYSTEM_PROGRAM_ID,
    byteLength: bytes.length,
  });
}

export function reserveDepletionRatio({ realTokenReserves, tokenTotalSupply } = {}) {
  if (
    realTokenReserves === undefined ||
    realTokenReserves === null ||
    tokenTotalSupply === undefined ||
    tokenTotalSupply === null
  ) {
    return null;
  }

  const remaining = Number(realTokenReserves);
  const supply = Number(tokenTotalSupply);
  if (!Number.isFinite(remaining) || !Number.isFinite(supply) || supply <= 0) {
    return null;
  }

  const sold = Math.max(0, supply - remaining);
  const ratio = sold / supply;
  if (!Number.isFinite(ratio) || ratio < 0) return null;
  return Math.min(1, ratio);
}
