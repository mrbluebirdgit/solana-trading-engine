# Pump / PumpSwap stage resolver v1

Status: **IMPLEMENTED, LIVE-LOCKED**  
Runtime authority: **none**

This module resolves Pump venue stage from pinned program/account facts. It does not trade, sign, or infer lifecycle from market cap.

## Predicates

| Stage | Required evidence |
|---|---|
| `pump_curve_active` | Bonding-curve account owned by `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` with `complete = false` |
| `migration_pending` | `complete = true` and the canonical PumpSwap pool is absent |
| `pumpswap_amm` | Canonical PumpSwap pool owned by `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` is present |
| `other_amm` | No readable Pump curve/canonical pool, but a verified non-canonical AMM relationship exists |
| `unknown` | Required state missing, stale, owner-mismatched, or contradictory |

Completion and migration remain separate. `migrate` / `migrate_v2` are permissionless and idempotent. A third-party pool is recorded as an `other_amm` relationship; it does not prove canonical migration.

## Authority and LP checks

- Mint and freeze authority stay applicable on the curve. Unread state is `unknown`, never `N/A`.
- Canonical initial-migration proof requires the canonical pool plus the migration's initial LP mint-and-burn. A generic current "LP burned" badge is insufficient because later PumpSwap LPs can mint and redeem.

## Inputs the resolver does not accept as stage evidence

- USD market cap or the ~$69k / ~85 SOL default-SOL shorthand
- Provider graduation labels
- Social presence
- Generic LP-supply badges

## Implementation

- `src/integrations/pump/decode-bonding-curve.mjs` — version-tolerant account decode
- `src/core/intelligence/pump-stage-resolver.mjs` — fail-closed stage, authority, and LP predicates
- Live RPC collection is still injected by the caller; this package adds no signer path
