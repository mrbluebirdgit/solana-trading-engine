import assert from "node:assert/strict";
import test from "node:test";

import { resolvePumpVenueStage } from "../src/core/intelligence/pump-stage-resolver.mjs";
import { resolveTokenAuthorityState } from "../src/core/intelligence/token-authority-state.mjs";
import { encodeBase58 } from "../src/integrations/pump/base58.mjs";
import {
  curveProgressRatio,
  decodeBondingCurveAccount,
} from "../src/integrations/pump/decode-bonding-curve.mjs";
import {
  NATIVE_SOL_MINT,
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
} from "../src/integrations/pump/program-ids.mjs";

const MINT = "ExampleMint1111111111111111111111111111111";

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
    bondingCurve: {
      address: "CurveAccount",
      ownerProgramId: PUMP_PROGRAM_ID,
      exists: true,
      complete: false,
      realTokenReserves: 500,
      tokenTotalSupply: 1000,
      quoteMint: NATIVE_SOL_MINT,
    },
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
  assert.equal(resolved.curveProgressRatio, 0.5);
});

test("does not treat curve completion as completed migration", () => {
  const resolved = resolvePumpVenueStage({
    mint: MINT,
    bondingCurve: {
      address: "CurveAccount",
      ownerProgramId: PUMP_PROGRAM_ID,
      exists: true,
      complete: true,
      realTokenReserves: 0,
      tokenTotalSupply: 1000,
    },
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
    bondingCurve: {
      address: "CurveAccount",
      ownerProgramId: PUMP_PROGRAM_ID,
      exists: true,
      complete: true,
    },
    canonicalPool: {
      address: "CanonicalPumpSwapPool",
      ownerProgramId: PUMPSWAP_PROGRAM_ID,
      exists: true,
      canonical: true,
    },
    otherPools: [
      {
        address: "RaydiumOrThirdParty",
        ownerProgramId: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
        exists: true,
      },
    ],
    migrationLp: { initialLpMinted: true, initialLpBurned: true },
  });

  assert.equal(resolved.venueStage, "pumpswap_amm");
  assert.equal(resolved.canonicalPoolAddress, "CanonicalPumpSwapPool");
  assert.equal(resolved.migrationLp.verified, true);
  assert.equal(resolved.migrationLp.laterLpMintRedeemPossible, true);
  assert.equal(resolved.otherAmmRelationships.length, 1);
});

test("treats a complete-false plus canonical-pool pair as contradictory", () => {
  const resolved = resolvePumpVenueStage({
    mint: MINT,
    bondingCurve: {
      address: "CurveAccount",
      ownerProgramId: PUMP_PROGRAM_ID,
      exists: true,
      complete: false,
    },
    canonicalPool: {
      address: "CanonicalPumpSwapPool",
      ownerProgramId: PUMPSWAP_PROGRAM_ID,
      exists: true,
      canonical: true,
    },
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
    bondingCurve: {
      address: "CurveAccount",
      exists: true,
      complete: true,
      ownerProgramId: PUMP_PROGRAM_ID,
    },
    canonicalPool: {
      address: "CanonicalPumpSwapPool",
      ownerProgramId: PUMPSWAP_PROGRAM_ID,
      exists: true,
      canonical: true,
    },
    migrationLp: { genericLpBurned: true },
  });

  assert.equal(resolved.venueStage, "pumpswap_amm");
  assert.equal(resolved.migrationLp.verified, false);
  assert.equal(
    resolved.migrationLp.reason,
    "generic_lp_burn_is_not_canonical_migration_proof",
  );
});

test("curve progress stays null when supply is missing", () => {
  assert.equal(curveProgressRatio({ realTokenReserves: 1 }), null);
  assert.equal(curveProgressRatio({ realTokenReserves: 250, tokenTotalSupply: 1000 }), 0.75);
});
