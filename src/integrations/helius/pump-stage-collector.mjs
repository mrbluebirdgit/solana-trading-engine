import { resolvePumpVenueStage } from "../../core/intelligence/pump-stage-resolver.mjs";
import {
  bondingCurveAddress,
  canonicalPumpSwapPoolAddress,
} from "../pump/addresses.mjs";
import { decodeBondingCurveAccount } from "../pump/decode-bonding-curve.mjs";
import {
  NATIVE_SOL_MINT,
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
} from "../pump/program-ids.mjs";
import { decodePublicKey } from "../solana/base58.mjs";
import { decodeSplMintAccount } from "../solana/spl-mint.mjs";
import { heliusRpcRequest } from "./rpc.mjs";

const COLLECTOR_VERSION = "helius-pump-stage-collector.v1";

function accountFromRpc(value) {
  if (!value) {
    return { exists: false, ownerProgramId: null, data: null };
  }
  const raw = Array.isArray(value.data) ? value.data[0] : value.data;
  return {
    exists: true,
    ownerProgramId: value.owner ?? null,
    data: raw ? Buffer.from(raw, "base64") : null,
    lamports: value.lamports ?? null,
  };
}

async function getAccounts(apiKey, addresses, options) {
  const result = await heliusRpcRequest(
    apiKey,
    "getMultipleAccounts",
    [addresses, { encoding: "base64", commitment: "confirmed" }],
    options,
  );
  const values = Array.isArray(result?.value) ? result.value : [];
  return {
    slot: result?.context?.slot ?? null,
    accounts: addresses.map((address, index) => ({
      address,
      ...accountFromRpc(values[index] ?? null),
    })),
  };
}

export async function collectPumpStageFromHelius(
  apiKey,
  mint,
  { fetchImpl = fetch, timeoutMs = 10_000, now = () => new Date() } = {},
) {
  decodePublicKey(mint, "mint");
  const observedAt = now().toISOString();
  const curve = bondingCurveAddress(mint);
  let pool = canonicalPumpSwapPoolAddress(mint, NATIVE_SOL_MINT);

  const first = await getAccounts(
    apiKey,
    [mint, curve.address, pool.address],
    { fetchImpl, timeoutMs },
  );

  const mintAccount = first.accounts[0];
  const curveAccount = first.accounts[1];
  let poolAccount = first.accounts[2];
  let decodedCurve = null;

  if (
    curveAccount.exists &&
    curveAccount.data &&
    curveAccount.ownerProgramId === PUMP_PROGRAM_ID
  ) {
    decodedCurve = decodeBondingCurveAccount({
      ownerProgramId: curveAccount.ownerProgramId,
      data: curveAccount.data,
    });
    if (
      decodedCurve.quoteMint &&
      decodedCurve.quoteMint !== NATIVE_SOL_MINT
    ) {
      pool = canonicalPumpSwapPoolAddress(mint, decodedCurve.quoteMint);
      const second = await getAccounts(apiKey, [pool.address], {
        fetchImpl,
        timeoutMs,
        id: 2,
      });
      poolAccount = second.accounts[0];
      if (second.slot !== null && first.slot !== null && second.slot < first.slot) {
        first.slot = second.slot;
      }
    }
  }

  const authorities = decodeSplMintAccount(mintAccount.data);

  const resolved = resolvePumpVenueStage({
    mint,
    bondingCurve: {
      address: curve.address,
      ownerProgramId: curveAccount.ownerProgramId,
      exists: curveAccount.exists,
      complete: decodedCurve ? decodedCurve.complete : null,
      realTokenReserves: decodedCurve ? Number(decodedCurve.realTokenReserves) : null,
      tokenTotalSupply: decodedCurve ? Number(decodedCurve.tokenTotalSupply) : null,
      quoteMint: decodedCurve ? decodedCurve.quoteMint : NATIVE_SOL_MINT,
    },
    canonicalPool: {
      address: pool.address,
      ownerProgramId: poolAccount.ownerProgramId,
      exists: poolAccount.exists && poolAccount.ownerProgramId === PUMPSWAP_PROGRAM_ID,
      canonical: true,
    },
    mintAuthority: mintAccount.exists ? authorities.mintAuthority : "unknown",
    freezeAuthority: mintAccount.exists ? authorities.freezeAuthority : "unknown",
  });

  return Object.freeze({
    collectorVersion: COLLECTOR_VERSION,
    source: "helius",
    sourceMethodVersion: COLLECTOR_VERSION,
    observedAt,
    cutoffSlot: first.slot,
    addresses: Object.freeze({
      mint,
      bondingCurve: curve.address,
      poolAuthority: pool.poolAuthority,
      canonicalPool: pool.address,
      quoteMint: pool.quoteMint,
    }),
    ...resolved,
  });
}
