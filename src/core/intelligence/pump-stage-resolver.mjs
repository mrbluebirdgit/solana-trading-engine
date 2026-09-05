import {
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
  PUMP_STAGE_RESOLVER_VERSION,
} from "../../integrations/pump/program-ids.mjs";
import {
  bondingCurveAddress,
  canonicalPumpSwapPoolAddress,
} from "../../integrations/pump/addresses.mjs";
import { resolveTokenAuthorityState } from "./token-authority-state.mjs";
import { VENUE_STAGES } from "./traffic-snapshot.mjs";

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalBoolean(value, field) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "boolean") {
    throw new TypeError(`${field} must be boolean`);
  }
  return value;
}

function accountExists(account) {
  return Boolean(account && account.exists === true);
}

function assessBondingCurve(curve, mint) {
  if (!curve || curve.exists === false) {
    return Object.freeze({ present: false, complete: null, abstentionReason: null });
  }
  if (curve.exists !== true) {
    return Object.freeze({
      present: false,
      complete: null,
      abstentionReason: "bonding_curve_existence_unconfirmed",
    });
  }
  if (curve.ownerProgramId !== PUMP_PROGRAM_ID) {
    return Object.freeze({
      present: false,
      complete: null,
      abstentionReason: "bonding_curve_owner_mismatch",
    });
  }
  if (typeof curve.address !== "string" || curve.address.trim() === "") {
    return Object.freeze({
      present: false,
      complete: null,
      abstentionReason: "bonding_curve_address_missing",
    });
  }

  let expectedCurve;
  try {
    expectedCurve = bondingCurveAddress(mint);
  } catch {
    return Object.freeze({
      present: false,
      complete: null,
      abstentionReason: "bonding_curve_relation_unverifiable",
    });
  }
  if (curve.address !== expectedCurve.address) {
    return Object.freeze({
      present: false,
      complete: null,
      abstentionReason: "bonding_curve_address_mismatch",
    });
  }

  const complete = optionalBoolean(curve.complete, "bondingCurve.complete");
  const hasDecodedFields =
    complete !== null &&
    Number.isFinite(curve.realTokenReserves) &&
    curve.realTokenReserves >= 0 &&
    Number.isFinite(curve.tokenTotalSupply) &&
    curve.tokenTotalSupply > 0 &&
    typeof curve.quoteMint === "string" &&
    curve.quoteMint.trim() !== "";
  if (!hasDecodedFields) {
    return Object.freeze({
      present: false,
      complete: null,
      abstentionReason: "bonding_curve_data_unverified",
    });
  }

  return Object.freeze({ present: true, complete, abstentionReason: null });
}

function assessCanonicalPumpSwapPool(pool, { mint, quoteMint }) {
  if (!pool || pool.exists === false) {
    return Object.freeze({ present: false, abstentionReason: null });
  }
  if (pool.exists !== true) {
    return Object.freeze({
      present: false,
      abstentionReason: "canonical_pool_existence_unconfirmed",
    });
  }
  if (typeof pool.address !== "string" || pool.address.trim() === "") {
    return Object.freeze({
      present: false,
      abstentionReason: "canonical_pool_address_missing",
    });
  }
  if (pool.ownerProgramId !== PUMPSWAP_PROGRAM_ID) {
    return Object.freeze({
      present: false,
      abstentionReason: "canonical_pool_owner_mismatch",
    });
  }
  if (pool.dataValid !== true) {
    return Object.freeze({
      present: false,
      abstentionReason:
        typeof pool.validationError === "string" && pool.validationError
          ? pool.validationError
          : "canonical_pool_data_unverified",
    });
  }
  if (pool.baseMint !== mint) {
    return Object.freeze({
      present: false,
      abstentionReason: "canonical_pool_base_mint_mismatch",
    });
  }
  if (typeof quoteMint !== "string" || quoteMint.trim() === "") {
    return Object.freeze({
      present: false,
      abstentionReason: "canonical_pool_quote_mint_unavailable",
    });
  }
  if (pool.quoteMint !== quoteMint) {
    return Object.freeze({
      present: false,
      abstentionReason: "canonical_pool_quote_mint_mismatch",
    });
  }

  let expectedPool;
  try {
    expectedPool = canonicalPumpSwapPoolAddress(mint, quoteMint);
  } catch {
    return Object.freeze({
      present: false,
      abstentionReason: "canonical_pool_relation_unverifiable",
    });
  }
  if (pool.address !== expectedPool.address) {
    return Object.freeze({
      present: false,
      abstentionReason: "canonical_pool_address_mismatch",
    });
  }

  return Object.freeze({ present: true, abstentionReason: null });
}

function classifyOtherPools(pools = []) {
  if (!Array.isArray(pools)) {
    throw new TypeError("otherPools must be an array");
  }
  // No non-PumpSwap venue decoder is allowlisted in v1. Caller-provided
  // owner/dataValid flags are not canonical evidence, so fail closed.
  return [];
}

function verifyInitialMigrationLp(evidence, canonicalPoolPresent) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return Object.freeze({
      verified: false,
      reason: "missing_initial_lp_evidence",
    });
  }

  const minted = optionalBoolean(evidence.initialLpMinted, "initialLpMinted");
  const burned = optionalBoolean(evidence.initialLpBurned, "initialLpBurned");
  const currentLpBurnBadge = optionalBoolean(
    evidence.genericLpBurned,
    "genericLpBurned",
  );

  if (!canonicalPoolPresent) {
    return Object.freeze({
      verified: false,
      reason: "canonical_pool_absent",
      genericLpBurnedInsufficient: currentLpBurnBadge === true,
    });
  }

  if (minted === true && burned === true) {
    return Object.freeze({
      verified: true,
      reason: "initial_lp_mint_and_burn",
      laterLpMintRedeemPossible: true,
    });
  }

  if (currentLpBurnBadge === true) {
    return Object.freeze({
      verified: false,
      reason: "generic_lp_burn_is_not_canonical_migration_proof",
      laterLpMintRedeemPossible: true,
    });
  }

  return Object.freeze({
    verified: false,
    reason: "initial_lp_mint_and_burn_unconfirmed",
    laterLpMintRedeemPossible: true,
  });
}

export function resolvePumpVenueStage(input = {}) {
  const mint = requiredText(input.mint, "mint");
  const bondingCurve = input.bondingCurve ?? null;
  const canonicalPool = input.canonicalPool ?? null;
  const suppliedOtherPools = input.otherPools ?? [];
  const otherPoolEvidenceSupplied = Array.isArray(suppliedOtherPools) &&
    suppliedOtherPools.some(accountExists);
  const otherPools = classifyOtherPools(suppliedOtherPools);

  if (typeof input.collectorAbstentionReason === "string" && input.collectorAbstentionReason) {
    return finalize({
      mint,
      venueStage: "unknown",
      abstentionReason: input.collectorAbstentionReason,
      bondingCurve,
      canonicalPool,
      otherPools,
      input,
    });
  }

  if (input.marketCapUsd !== undefined && input.classifyFromMarketCap === true) {
    throw new TypeError("market cap cannot classify Pump venue stage");
  }

  const curveAssessment = assessBondingCurve(bondingCurve, mint);
  const curvePresent = curveAssessment.present;
  const complete = curveAssessment.complete;
  if (curveAssessment.abstentionReason) {
    return finalize({
      mint,
      venueStage: "unknown",
      abstentionReason: curveAssessment.abstentionReason,
      bondingCurve,
      canonicalPool,
      otherPools,
      input,
    });
  }

  const expectedQuoteMint =
    bondingCurve && typeof bondingCurve.quoteMint === "string"
      ? bondingCurve.quoteMint
      : typeof input.quoteMint === "string"
        ? input.quoteMint
        : canonicalPool && typeof canonicalPool.quoteMint === "string"
          ? canonicalPool.quoteMint
          : null;
  const canonicalAssessment = assessCanonicalPumpSwapPool(canonicalPool, {
    mint,
    quoteMint: expectedQuoteMint,
  });
  const canonicalPresent = canonicalAssessment.present;
  if (canonicalAssessment.abstentionReason) {
    return finalize({
      mint,
      venueStage: "unknown",
      abstentionReason: canonicalAssessment.abstentionReason,
      bondingCurve,
      canonicalPool,
      otherPools,
      input,
    });
  }

  if (complete === false && canonicalPresent) {
    return finalize({
      mint,
      venueStage: "unknown",
      abstentionReason: "complete_false_with_canonical_pool",
      bondingCurve,
      canonicalPool,
      otherPools,
      input,
    });
  }

  if (!curvePresent || complete === null) {
    if (canonicalPresent) {
      return finalize({
        mint,
        venueStage: "pumpswap_amm",
        abstentionReason: null,
        bondingCurve,
        canonicalPool,
        otherPools,
        input,
        notes: ["curve_state_unavailable_pool_present"],
      });
    }
    if (otherPools.length > 0) {
      return finalize({
        mint,
        venueStage: "other_amm",
        abstentionReason: null,
        bondingCurve,
        canonicalPool,
        otherPools,
        input,
      });
    }
    return finalize({
      mint,
      venueStage: "unknown",
      abstentionReason: curvePresent
        ? "bonding_curve_complete_unreadable"
        : otherPoolEvidenceSupplied
          ? "other_amm_decoder_unavailable"
        : "bonding_curve_absent",
      bondingCurve,
      canonicalPool,
      otherPools,
      input,
    });
  }

  if (complete === false) {
    return finalize({
      mint,
      venueStage: "pump_curve_active",
      abstentionReason: null,
      bondingCurve,
      canonicalPool,
      otherPools,
      input,
    });
  }

  if (canonicalPresent) {
    return finalize({
      mint,
      venueStage: "pumpswap_amm",
      abstentionReason: null,
      bondingCurve,
      canonicalPool,
      otherPools,
      input,
    });
  }

  return finalize({
    mint,
    venueStage: "migration_pending",
    abstentionReason: null,
    bondingCurve,
    canonicalPool,
    otherPools,
    input,
  });
}

function finalize({
  mint,
  venueStage,
  abstentionReason,
  bondingCurve,
  canonicalPool,
  otherPools,
  input,
  notes = [],
}) {
  if (!VENUE_STAGES.includes(venueStage)) {
    throw new TypeError("resolver emitted an invalid venue stage");
  }

  const authorities = resolveTokenAuthorityState({
    venueStage,
    mintAuthority: input.mintAuthority,
    freezeAuthority: input.freezeAuthority,
  });

  const migrationLp = verifyInitialMigrationLp(
    input.migrationLp,
    venueStage === "pumpswap_amm",
  );

  const quoteMint =
    bondingCurve && typeof bondingCurve.quoteMint === "string"
      ? bondingCurve.quoteMint
      : input.quoteMint ?? null;

  return Object.freeze({
    schemaVersion: 1,
    resolverVersion: PUMP_STAGE_RESOLVER_VERSION,
    runtimeAuthority: false,
    mint,
    venueStage,
    programId: PUMP_PROGRAM_ID,
    quoteMint,
    curveComplete: bondingCurve ? bondingCurve.complete ?? null : null,
    // Graduation progress requires versioned global/configuration inputs that the
    // v1 live collector does not yet capture. Reserve depletion is not a safe
    // substitute, so this field intentionally stays unavailable.
    curveProgressRatio: null,
    curveProgressUnavailableReason: "versioned_graduation_inputs_not_collected",
    canonicalPoolAddress: accountExists(canonicalPool)
      ? canonicalPool.address ?? null
      : null,
    canonicalPoolPresent: venueStage === "pumpswap_amm",
    otherAmmRelationships: Object.freeze(
      otherPools.map((pool) =>
        Object.freeze({
          address: pool.address ?? null,
          ownerProgramId: pool.ownerProgramId ?? null,
        }),
      ),
    ),
    mintAuthority: authorities.mintAuthority,
    freezeAuthority: authorities.freezeAuthority,
    authoritiesApplicableOnCurve: true,
    migrationLp,
    marketCapIgnored: input.marketCapUsd !== undefined,
    abstentionReason,
    notes: Object.freeze(notes),
  });
}
