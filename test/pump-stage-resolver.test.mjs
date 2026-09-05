import assert from "node:assert/strict";
import test from "node:test";

import { resolvePumpVenueStage } from "../src/core/intelligence/pump-stage-resolver.mjs";
import { resolveTokenAuthorityState } from "../src/core/intelligence/token-authority-state.mjs";
import { encodeBase58 } from "../src/integrations/pump/base58.mjs";
import {
  decodeBondingCurveAccount,
  reserveDepletionRatio,
} from "../src/integrations/pump/decode-bonding-curve.mjs";
import {
  NATIVE_SOL_MINT,
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  BONDING_CURVE_DISCRIMINATOR,
} from "../src/integrations/pump/program-ids.mjs";
import {
  bondingCurveAddress,
  canonicalPumpSwapPoolAddress,
} from "../src/integrations/pump/addresses.mjs";

const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function canonicalPoolEvidence(overrides = {}) {
  const expected = canonicalPumpSwapPoolAddress(MINT, NATIVE_SOL_MINT);
  return {
    address: expected.address,
    ownerProgramId: PUMPSWAP_PROGRAM_ID,
    exists: true,
    dataValid: true,
    baseMint: MINT,
    quoteMint: NATIVE_SOL_MINT,
    ...overrides,
  };
}

function bondingCurveEvidence(overrides = {}) {
  return {
    address: bondingCurveAddress(MINT).address,
    ownerProgramId: PUMP_PROGRAM_ID,
    exists: true,
    complete: false,
    realTokenReserves: 500,
    tokenTotalSupply: 1_000,
    quoteMint: NATIVE_SOL_MINT,
    ...overrides,
  };
}

function writeU64(bytes, offset, value) {
  const view = new DataView(bytes.buffer, offset, 8);
  view.setBigUint64(0, BigInt(value), true);
}

function bondingCurveBytes({
  complete = false,
  realTokenReserves = 793_100_000_000_000n,
  tokenTotalSupply = 1_000_000_000_000_000n,
  quoteMint = SYSTEM_PROGRAM_ID,
} = {}) {
  const bytes = new Uint8Array(115);
  bytes.set(BONDING_CURVE_DISCRIMINATOR, 0);
  writeU64(bytes, 8, 1_073_000_000_000_000n);
  writeU64(bytes, 16, 30_000_000_000n);
  writeU64(bytes, 24, realTokenReserves);
  writeU64(bytes, 32, 13n);
  writeU64(bytes, 40, tokenTotalSupply);
  bytes[48] = complete ? 1 : 0;
  bytes.set(new Uint8Array(32).fill(7), 49);
  bytes[81] = 0;
  bytes[82] = 0;
  if (quoteMint === SYSTEM_PROGRAM_ID) {
    bytes.set(new Uint8Array(32), 83);
  }
  return bytes;
}

test("decodes complete, reserves and default SOL quote mint", () => {
  const decoded = decodeBondingCurveAccount({
    ownerProgramId: PUMP_PROGRAM_ID,
    data: bondingCurveBytes({ complete: true, realTokenReserves: 0n }),
  });

  assert.equal(decoded.complete, true);
  assert.equal(decoded.realTokenReserves, 0n);
  assert.equal(decoded.quoteMint, NATIVE_SOL_MINT);
  assert.equal(decoded.creator, encodeBase58(new Uint8Array(32).fill(7)));
});

test("rejects a bonding-curve account owned by another program", () => {
  assert.throws(
    () =>
      decodeBondingCurveAccount({
        ownerProgramId: PUMPSWAP_PROGRAM_ID,
        data: bondingCurveBytes(),
      }),
    /not the Pump program/,
  );
});

test("emits pump_curve_active when complete is false", () => {
  const resolved = resolvePumpVenueStage({
    mint: MINT,
    bondingCurve: bondingCurveEvidence(),
    mintAuthority: "active",
    freezeAuthority: "renounced",
    marketCapUsd: 69_000,
  });

  assert.equal(resolved.venueStage, "pump_curve_active");
  assert.equal(resolved.curveComplete, false);
  assert.equal(resolved.marketCapIgnored, true);
  assert.equal(resolved.runtimeAuthority, false);
  assert.equal(resolved.mintAuthority, "active");
  assert.equal(resolved.authoritiesApplicableOnCurve, true);
  assert.equal(resolved.curveProgressRatio, null);
  assert.equal(
    resolved.curveProgressUnavailableReason,
    "versioned_graduation_inputs_not_collected",
  );
});

test("does not treat curve completion as completed migration", () => {
  const resolved = resolvePumpVenueStage({
    mint: MINT,
    bondingCurve: bondingCurveEvidence({ complete: true, realTokenReserves: 0 }),
    canonicalPool: { exists: false },
    migrationLp: { genericLpBurned: true },
  });

  assert.equal(resolved.venueStage, "migration_pending");
  assert.equal(resolved.canonicalPoolPresent, false);
  assert.equal(resolved.migrationLp.verified, false);
  assert.match(resolved.migrationLp.reason, /generic_lp_burn|canonical_pool_absent/);
});

test("emits pumpswap_amm only when the canonical pool is present", () => {
  const resolved = resolvePumpVenueStage({
    mint: MINT,
    bondingCurve: bondingCurveEvidence({ complete: true, realTokenReserves: 0 }),
    canonicalPool: canonicalPoolEvidence(),
    otherPools: [
      {
        address: "RaydiumOrThirdParty",
        ownerProgramId: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
        exists: true,
        dataValid: true,
        baseMint: MINT,
        quoteMint: NATIVE_SOL_MINT,
      },
    ],
    migrationLp: { initialLpMinted: true, initialLpBurned: true },
  });

  assert.equal(resolved.venueStage, "pumpswap_amm");
  assert.equal(
    resolved.canonicalPoolAddress,
    canonicalPumpSwapPoolAddress(MINT, NATIVE_SOL_MINT).address,
  );
  assert.equal(resolved.migrationLp.verified, true);
  assert.equal(resolved.migrationLp.laterLpMintRedeemPossible, true);
  assert.equal(resolved.otherAmmRelationships.length, 0);
});

test("treats a complete-false plus canonical-pool pair as contradictory", () => {
  const resolved = resolvePumpVenueStage({
    mint: MINT,
    bondingCurve: bondingCurveEvidence(),
    canonicalPool: canonicalPoolEvidence(),
  });

  assert.equal(resolved.venueStage, "unknown");
  assert.equal(resolved.abstentionReason, "complete_false_with_canonical_pool");
});

test("rejects market-cap classification", () => {
  assert.throws(
    () =>
      resolvePumpVenueStage({
        mint: MINT,
        classifyFromMarketCap: true,
        marketCapUsd: 69_000,
      }),
    /market cap cannot classify/,
  );
});

test("never marks mint or freeze authority as not applicable on a curve", () => {
  assert.throws(
    () =>
      resolveTokenAuthorityState({
        venueStage: "pump_curve_active",
        mintAuthority: "n/a",
        freezeAuthority: "renounced",
      }),
    /cannot be marked not applicable/,
  );

  const unread = resolveTokenAuthorityState({
    venueStage: "pump_curve_active",
  });
  assert.equal(unread.mintAuthority, "unknown");
  assert.equal(unread.freezeAuthority, "unknown");
  assert.equal(unread.applicableOnCurve, true);
});

test("generic LP-burn badge is not canonical migration proof", () => {
  const resolved = resolvePumpVenueStage({
    mint: MINT,
    bondingCurve: bondingCurveEvidence({ complete: true, realTokenReserves: 0 }),
    canonicalPool: canonicalPoolEvidence(),
    migrationLp: { genericLpBurned: true },
  });

  assert.equal(resolved.venueStage, "pumpswap_amm");
  assert.equal(resolved.migrationLp.verified, false);
  assert.equal(
    resolved.migrationLp.reason,
    "generic_lp_burn_is_not_canonical_migration_proof",
  );
});

test("reserve depletion is not mislabeled as graduation progress", () => {
  assert.equal(reserveDepletionRatio({ realTokenReserves: 1 }), null);
  assert.equal(reserveDepletionRatio({ realTokenReserves: 250, tokenTotalSupply: 1000 }), 0.75);
});

test("rejects a bonding-curve account with the wrong discriminator", () => {
  const bytes = bondingCurveBytes();
  bytes[0] ^= 0xff;
  assert.throws(
    () => decodeBondingCurveAccount({ ownerProgramId: PUMP_PROGRAM_ID, data: bytes }),
    /discriminator is invalid/,
  );
});

test("does not classify a canonical pool from an address or self-asserted flag", () => {
  const evidence = canonicalPoolEvidence();
  delete evidence.exists;
  evidence.canonical = true;

  const resolved = resolvePumpVenueStage({
    mint: MINT,
    bondingCurve: bondingCurveEvidence({ complete: true, realTokenReserves: 0 }),
    canonicalPool: evidence,
  });

  assert.equal(resolved.venueStage, "unknown");
  assert.equal(
    resolved.abstentionReason,
    "canonical_pool_existence_unconfirmed",
  );
  assert.equal(resolved.canonicalPoolPresent, false);
});

test("requires the exact PumpSwap owner and decoded pool evidence", () => {
  for (const [overrides, reason] of [
    [{ ownerProgramId: PUMP_PROGRAM_ID }, "canonical_pool_owner_mismatch"],
    [{ dataValid: undefined }, "canonical_pool_data_unverified"],
  ]) {
    const resolved = resolvePumpVenueStage({
      mint: MINT,
      bondingCurve: bondingCurveEvidence({ complete: true, realTokenReserves: 0 }),
      canonicalPool: canonicalPoolEvidence(overrides),
    });

    assert.equal(resolved.venueStage, "unknown");
    assert.equal(resolved.abstentionReason, reason);
    assert.equal(resolved.canonicalPoolPresent, false);
  }
});

test("requires decoded mint fields and the exact canonical pool PDA", () => {
  for (const [overrides, reason] of [
    [{ baseMint: NATIVE_SOL_MINT }, "canonical_pool_base_mint_mismatch"],
    [{ quoteMint: MINT }, "canonical_pool_quote_mint_mismatch"],
    [{ address: PUMP_PROGRAM_ID }, "canonical_pool_address_mismatch"],
  ]) {
    const resolved = resolvePumpVenueStage({
      mint: MINT,
      bondingCurve: bondingCurveEvidence({ complete: true, realTokenReserves: 0 }),
      canonicalPool: canonicalPoolEvidence(overrides),
    });

    assert.equal(resolved.venueStage, "unknown");
    assert.equal(resolved.abstentionReason, reason);
    assert.equal(resolved.canonicalPoolPresent, false);
  }
});

test("requires canonical curve ownership, PDA relation, and decoded fields", () => {
  for (const [overrides, reason] of [
    [{ ownerProgramId: PUMPSWAP_PROGRAM_ID }, "bonding_curve_owner_mismatch"],
    [{ address: PUMP_PROGRAM_ID }, "bonding_curve_address_mismatch"],
    [{ realTokenReserves: undefined }, "bonding_curve_data_unverified"],
  ]) {
    const resolved = resolvePumpVenueStage({
      mint: MINT,
      bondingCurve: bondingCurveEvidence(overrides),
      canonicalPool: { exists: false },
    });

    assert.equal(resolved.venueStage, "unknown");
    assert.equal(resolved.abstentionReason, reason);
  }
});

test("does not classify another AMM without an allowlisted decoder", () => {
  const unresolved = resolvePumpVenueStage({
    mint: MINT,
    bondingCurve: { exists: false },
    canonicalPool: { exists: false },
    otherPools: [{ address: "UnverifiedPool", exists: true }],
  });
  assert.equal(unresolved.venueStage, "unknown");

  const decodedButUnallowlisted = resolvePumpVenueStage({
    mint: MINT,
    bondingCurve: { exists: false },
    canonicalPool: { exists: false },
    otherPools: [
      {
        address: "VerifiedThirdPartyPool",
        ownerProgramId: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
        exists: true,
        dataValid: true,
        baseMint: MINT,
        quoteMint: NATIVE_SOL_MINT,
      },
    ],
  });
  assert.equal(decodedButUnallowlisted.venueStage, "unknown");
  assert.equal(
    decodedButUnallowlisted.abstentionReason,
    "other_amm_decoder_unavailable",
  );
  assert.equal(decodedButUnallowlisted.otherAmmRelationships.length, 0);
});
