import {
  NATIVE_SOL_MINT,
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
} from "./program-ids.mjs";
import { decodePublicKey } from "../solana/base58.mjs";
import { findProgramAddress } from "../solana/pda.mjs";

export function bondingCurveAddress(mint) {
  return findProgramAddress(
    ["bonding-curve", decodePublicKey(mint, "mint")],
    PUMP_PROGRAM_ID,
  );
}

export function pumpPoolAuthorityAddress(mint) {
  return findProgramAddress(
    ["pool-authority", decodePublicKey(mint, "mint")],
    PUMP_PROGRAM_ID,
  );
}

export function canonicalPumpSwapPoolAddress(
  mint,
  quoteMint = NATIVE_SOL_MINT,
) {
  const authority = pumpPoolAuthorityAddress(mint);
  const index = Buffer.alloc(2);
  return Object.freeze({
    ...findProgramAddress(
      [
        "pool",
        index,
        decodePublicKey(authority.address, "poolAuthority"),
        decodePublicKey(mint, "mint"),
        decodePublicKey(quoteMint, "quoteMint"),
      ],
      PUMPSWAP_PROGRAM_ID,
    ),
    poolAuthority: authority.address,
    quoteMint,
    index: 0,
  });
}

