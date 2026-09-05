# Pump / PumpSwap stage resolver v1

Status: **IMPLEMENTED, LIVE-LOCKED**  
Runtime authority: **none**

This module resolves Pump venue stage from program/account facts hard-coded
against the official Pump IDLs at commit
[`9c82f61`](https://github.com/pump-fun/pump-public-docs/commit/9c82f61cb711b044a17f770ab8ce9f9bdf78f333),
reviewed on 2026-09-04. It does not trade, sign, or infer lifecycle from market
cap. A program/IDL upgrade requires revalidation; the beta does not detect that
upgrade automatically.

## Predicates

| Stage | Required evidence |
|---|---|
| `pump_curve_active` | Exact derived bonding-curve PDA exists, is Pump-owned and discriminator-valid, has coherent nonnegative reserves, positive supply and a nonempty quote mint, with `complete = false` |
| `migration_pending` | The same fully validated curve has `complete = true` and the exact derived canonical PumpSwap pool is explicitly absent |
| `pumpswap_amm` | Canonically derived PumpSwap pool is owned by `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`, has the official Pool discriminator, and contains the expected base and quote mints |
| `other_amm` | Reserved. V1 emits `unknown` until a non-PumpSwap venue decoder and program ID are explicitly allowlisted; caller-supplied flags are insufficient |
| `unknown` | Required state missing, stale, owner-mismatched, or contradictory |

Completion and migration remain separate. `migrate` / `migrate_v2` are permissionless and idempotent. A third-party pool is recorded as an `other_amm` relationship; it does not prove canonical migration.

The live collector intentionally leaves `curveProgressRatio` null. The current
account's reserve depletion is not a version-safe graduation percentage; a
verified progress value requires the applicable global/configuration inputs.

Current limitation: Token-2022 mint extensions are not yet decoded and
allowlisted. The collector therefore abstains on Token-2022 / `create_v2`
candidates instead of treating unknown transfer, fee, or authority behavior as
safe. This observation beta covers legacy SPL-token launches and canonical
migrations that pass the implemented account checks; it is not broad coverage
of every current Pump launch.

## Authority and LP checks

- Mint and freeze authority stay applicable on the curve. Unread state is `unknown`, never `N/A`.
- Canonical initial-migration proof requires the canonical pool plus the migration's initial LP mint-and-burn. A generic current "LP burned" badge is insufficient because later PumpSwap LPs can mint and redeem.

## Inputs the resolver does not accept as stage evidence

- USD market cap or the ~$69k / ~85 SOL default-SOL shorthand
- Provider graduation labels
- Social presence
- Generic LP-supply badges

## Implementation

- `src/integrations/pump/decode-bonding-curve.mjs` — discriminator-checked account decode
- `src/integrations/pump/decode-pumpswap-pool.mjs` — discriminator and base/quote-mint checks against the reviewed [PumpSwap IDL](https://github.com/pump-fun/pump-public-docs/blob/9c82f61cb711b044a17f770ab8ce9f9bdf78f333/idl/pump_amm.json)
- `src/core/intelligence/pump-stage-resolver.mjs` — fail-closed stage, authority, and LP predicates
- `src/integrations/helius/pump-stage-collector.mjs` — read-only Helius `getMultipleAccounts` collector
- Local command: `npm run observe:pump-stage:local -- <mint>`
- The collector never signs, builds a transaction, or authorizes a buy
- `minContextSlot` is a lower bound, not event-slot reconstruction. The
  collector records the returned cutoff slot and, for a non-SOL quote mint,
  re-reads mint, curve, and the actual canonical pool in one RPC batch.
