import { resolvePumpVenueStage } from "../../core/intelligence/pump-stage-resolver.mjs";
import {
  bondingCurveAddress,
  canonicalPumpSwapPoolAddress,
} from "../pump/addresses.mjs";
import { decodeBondingCurveAccount } from "../pump/decode-bonding-curve.mjs";
import { decodePumpSwapPoolAccount } from "../pump/decode-pumpswap-pool.mjs";
import {
  NATIVE_SOL_MINT,
  PUMP_PROGRAM_ID,
  PUMP_IDL_REFERENCE_COMMIT,
  PUMPSWAP_PROGRAM_ID,
  SPL_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "../pump/program-ids.mjs";
import { decodePublicKey } from "../solana/base58.mjs";
import {
  decodeSplMintAccount,
  inspectToken2022MintExtensions,
} from "../solana/spl-mint.mjs";
import { heliusRpcRequest } from "./rpc.mjs";

const COLLECTOR_VERSION = "helius-pump-stage-collector.v2";

function accountFromRpc(value) {
  if (!value) {
    return { exists: false, ownerProgramId: null, data: null };
  }
  if (
    typeof value !== "object" ||
    typeof value.owner !== "string" ||
    (!Array.isArray(value.data) && typeof value.data !== "string")
  ) {
    throw new TypeError("Helius account response is malformed");
  }
  const raw = Array.isArray(value.data) ? value.data[0] : value.data;
  return {
    exists: true,
    ownerProgramId: value.owner ?? null,
    data: raw ? Buffer.from(raw, "base64") : null,
    lamports: value.lamports ?? null,
  };
}

async function getAccounts(apiKey, addresses, { minContextSlot, ...options } = {}) {
  const configuration = { encoding: "base64", commitment: "confirmed" };
  if (Number.isSafeInteger(minContextSlot) && minContextSlot >= 0) {
    configuration.minContextSlot = minContextSlot;
  }
  const result = await heliusRpcRequest(
    apiKey,
    "getMultipleAccounts",
    [addresses, configuration],
    options,
  );
  const values = Array.isArray(result?.value) ? result.value : [];
  if (values.length !== addresses.length) {
    throw new TypeError("Helius account response length does not match the request");
  }
  return {
    slot: result?.context?.slot ?? null,
    accounts: addresses.map((address, index) => ({
      address,
      ...accountFromRpc(values[index] ?? null),
    })),
  };
}

function validContextSlot(slot, minimum) {
  return (
    Number.isSafeInteger(slot) &&
    slot >= 0 &&
    (minimum === null || slot >= minimum)
  );
}

export async function collectPumpStageFromHelius(
  apiKey,
  mint,
  {
    fetchImpl = fetch,
    timeoutMs = 10_000,
    now = () => new Date(),
    minContextSlot = null,
    signal,
  } = {},
) {
  decodePublicKey(mint, "mint");
  if (
    minContextSlot !== null &&
    (!Number.isSafeInteger(minContextSlot) || minContextSlot < 0)
  ) {
    throw new TypeError("minContextSlot must be a non-negative safe integer or null");
  }
  const curve = bondingCurveAddress(mint);
  let pool = canonicalPumpSwapPoolAddress(mint, NATIVE_SOL_MINT);
  const sourceSlots = [];

  const first = await getAccounts(
    apiKey,
    [mint, curve.address, pool.address],
    { fetchImpl, timeoutMs, minContextSlot, signal },
  );

  sourceSlots.push(first.slot);
  let cutoffSlot = first.slot;
  let mintAccount = first.accounts[0];
  let curveAccount = first.accounts[1];
  let poolAccount = first.accounts[2];
  let decodedCurve = null;
  let collectorAbstentionReason = validContextSlot(first.slot, minContextSlot)
    ? null
    : "invalid_rpc_context_slot";

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
      collectorAbstentionReason === null &&
      decodedCurve.quoteMint &&
      decodedCurve.quoteMint !== NATIVE_SOL_MINT
    ) {
      pool = canonicalPumpSwapPoolAddress(mint, decodedCurve.quoteMint);
      const expectedQuoteMint = decodedCurve.quoteMint;
      const second = await getAccounts(apiKey, [mint, curve.address, pool.address], {
        fetchImpl,
        timeoutMs,
        id: 2,
        minContextSlot: first.slot,
        signal,
      });
      sourceSlots.push(second.slot);
      cutoffSlot = second.slot;
      mintAccount = second.accounts[0];
      curveAccount = second.accounts[1];
      poolAccount = second.accounts[2];

      if (!validContextSlot(second.slot, first.slot)) {
        collectorAbstentionReason = "invalid_rpc_context_slot";
      } else if (
        !curveAccount.exists ||
        !curveAccount.data ||
        curveAccount.ownerProgramId !== PUMP_PROGRAM_ID
      ) {
        collectorAbstentionReason = "bonding_curve_snapshot_unavailable";
        decodedCurve = null;
      } else {
        decodedCurve = decodeBondingCurveAccount({
          ownerProgramId: curveAccount.ownerProgramId,
          data: curveAccount.data,
        });
        if (decodedCurve.quoteMint !== expectedQuoteMint) {
          collectorAbstentionReason = "quote_mint_changed_during_snapshot";
        }
      }
    }
  }

  const authorities = decodeSplMintAccount(mintAccount.data);
  const token2022Inspection = mintAccount.ownerProgramId === TOKEN_2022_PROGRAM_ID
    ? inspectToken2022MintExtensions(mintAccount.data, {
        expectedMintBytes: decodePublicKey(mint, "mint"),
      })
    : null;
  if (collectorAbstentionReason === null && !mintAccount.exists) {
    collectorAbstentionReason = "mint_account_absent";
  } else if (collectorAbstentionReason === null &&
    mintAccount.ownerProgramId !== SPL_TOKEN_PROGRAM_ID &&
    mintAccount.ownerProgramId !== TOKEN_2022_PROGRAM_ID
  ) {
    collectorAbstentionReason = "mint_account_owner_mismatch";
  } else if (collectorAbstentionReason === null && authorities.initialized !== true) {
    collectorAbstentionReason = "mint_account_uninitialized_or_truncated";
  } else if (
    collectorAbstentionReason === null &&
    token2022Inspection &&
    token2022Inspection.safe !== true
  ) {
    collectorAbstentionReason = token2022Inspection.reason;
  }

  let decodedPool = null;
  let poolValidationError = null;
  if (poolAccount.exists && poolAccount.ownerProgramId === PUMPSWAP_PROGRAM_ID) {
    try {
      decodedPool = decodePumpSwapPoolAccount({
        ownerProgramId: poolAccount.ownerProgramId,
        data: poolAccount.data,
      });
      if (decodedPool.baseMint !== mint) {
        poolValidationError = "canonical_pool_base_mint_mismatch";
      } else if (decodedPool.quoteMint !== pool.quoteMint) {
        poolValidationError = "canonical_pool_quote_mint_mismatch";
      } else if (decodedPool.index !== pool.index) {
        poolValidationError = "canonical_pool_index_mismatch";
      } else if (decodedPool.poolBump !== pool.bump) {
        poolValidationError = "canonical_pool_bump_mismatch";
      } else if (decodedPool.creator !== pool.poolAuthority) {
        poolValidationError = "canonical_pool_creator_mismatch";
      }
    } catch {
      poolValidationError = "canonical_pool_data_invalid";
    }
  }

  const resolved = resolvePumpVenueStage({
    mint,
    collectorAbstentionReason,
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
      exists: poolAccount.exists,
      canonical: true,
      dataValid:
        poolAccount.exists && poolAccount.ownerProgramId === PUMPSWAP_PROGRAM_ID
          ? poolValidationError === null
          : null,
      validationError: poolValidationError,
      baseMint: decodedPool?.baseMint ?? null,
      quoteMint: decodedPool?.quoteMint ?? null,
    },
    mintAuthority: mintAccount.exists ? authorities.mintAuthority : "unknown",
    freezeAuthority: mintAccount.exists ? authorities.freezeAuthority : "unknown",
  });

  return Object.freeze({
    collectorVersion: COLLECTOR_VERSION,
    source: "helius",
    sourceMethodVersion: COLLECTOR_VERSION,
    idlReferenceCommit: PUMP_IDL_REFERENCE_COMMIT,
    observedAt: now().toISOString(),
    cutoffSlot,
    sourceSlots: Object.freeze(sourceSlots),
    commitment: "confirmed",
    addresses: Object.freeze({
      mint,
      bondingCurve: curve.address,
      poolAuthority: pool.poolAuthority,
      canonicalPool: pool.address,
      quoteMint: pool.quoteMint,
    }),
    mintProgramId: mintAccount.ownerProgramId ?? null,
    token2022Extensions: token2022Inspection?.extensions ?? Object.freeze([]),
    ...resolved,
  });
}
