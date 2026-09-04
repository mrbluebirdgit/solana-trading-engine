import { curveProgressRatio } from "../../integrations/pump/decode-bonding-curve.mjs";
import {
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
  PUMP_STAGE_RESOLVER_VERSION,
} from "../../integrations/pump/program-ids.mjs";
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
  if (!account || account.exists === false) return false;
  if (account.exists === true) return true;
  return Boolean(account.address);
}

function isCanonicalPumpSwapPool(pool) {
  if (!accountExists(pool)) return false;
  const owner = typeof pool.ownerProgramId === "string" ? pool.ownerProgramId : "";
  if (owner && owner !== PUMPSWAP_PROGRAM_ID) return false;
  if (pool.canonical === false) return false;
  return pool.canonical === true || owner === PUMPSWAP_PROGRAM_ID;
}

function classifyOtherPools(pools = []) {
  if (!Array.isArray(pools)) {
    throw new TypeError("otherPools must be an array");
  }
  return pools.filter((pool) => {
    if (!accountExists(pool)) return false;
    if (isCanonicalPumpSwapPool(pool)) return false;
    return true;
  });
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
  const otherPools = classifyOtherPools(input.otherPools ?? []);

  if (input.marketCapUsd !== undefined && input.classifyFromMarketCap === true) {
    throw new TypeError("market cap cannot classify Pump venue stage");
  }

  const curveOwner =
    bondingCurve && typeof bondingCurve.ownerProgramId === "string"
      ? bondingCurve.ownerProgramId
      : null;
  const curvePresent = accountExists(bondingCurve);
  const complete = curvePresent
    ? optionalBoolean(bondingCurve.complete, "bondingCurve.complete")
    : null;

  if (curvePresent && curveOwner && curveOwner !== PUMP_PROGRAM_ID) {
    return finalize({
      mint,
      venueStage: "unknown",
      abstentionReason: "bonding_curve_owner_mismatch",
      bondingCurve,
      canonicalPool,
      otherPools,
      input,
    });
  }

  const canonicalPresent = isCanonicalPumpSwapPool(canonicalPool);
  if (
    accountExists(canonicalPool) &&
    canonicalPool.ownerProgramId &&
    canonicalPool.ownerProgramId !== PUMPSWAP_PROGRAM_ID &&
    canonicalPool.canonical === true
  ) {
    return finalize({
      mint,
      venueStage: "unknown",
      abstentionReason: "canonical_pool_owner_mismatch",
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
    curveProgressRatio: curveProgressRatio(bondingCurve ?? {}),
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
