# Master decision contract v1

Status: **SPECIFIED, NOT YET IMPLEMENTED**  
Trading mode: **LIVE-LOCKED**

This is the contract the eventual master executor must implement. It compiles the project instructions into one deterministic order while keeping research models, provider data and the signer in separate trust domains.

## Inputs

An evaluation request contains a canonical mint, observation cutoff, intended quote currency, notional range and strategy/policy/model versions. Every feature must prove it existed by the cutoff. Missing, stale or disputed critical inputs are explicit values and may force abstention.

## Deterministic order

1. Resolve the exact mint, venue, stage, program IDs and current slot lineage.
2. Verify source health, freshness, event-time eligibility and provider disagreement.
3. Decode program/mint/account/curve/pool/authority/extension state from fresh RPC data.
4. Build and simulate the candidate entry and supported exit path using allowlisted instructions.
5. Compute manipulation-risk features and calibrated `p_adverse` with uncertainty.
6. Compute entity/wallet features from prior closed activity and calibrated quality with uncertainty.
7. Compute organic-flow/context features and the follower `net_return_distribution`.
8. Request independent executable routes and compute `p_execution` plus all-in cost/shortfall distribution.
9. Apply portfolio, concentration, notional, fee/tip, drawdown, duplication and kill-switch gates.
10. Emit one decision with complete reasons: `REJECT`, `ALERT_ONLY`, or `PAPER_ELIGIBLE`.
11. Paper-submit through the same lifecycle and reconcile from confirmed chain metadata.

There is intentionally no live decision state in v1. A future policy version may add `LIVE_CANDIDATE` only after the research protocol's promotion gates and a separate explicit owner action.

## Conservative decision rule

The policy compares the conservative lower bound of follower net utility—not headline token return—with zero and the capital risk budget. Net utility includes entry and exit proceeds, every fee/tip, impact, quote-to-land drift, failures, MEV/tail stress, opportunity cost and model uncertainty.

The executor abstains unless:

- every hard protocol/data/signer gate passes;
- the adverse-risk operating point passes for this venue/stage/regime;
- the conservative net-return bound is positive after all modeled costs;
- execution feasibility and an exit path meet the current risk budget;
- portfolio and kill-switch state permit a new intent;
- all required evidence can be reproduced from logged hashes and versions.

No provider score, social trend, wallet label, graduation prediction or LLM output can independently satisfy these conditions.

## Source authority hierarchy

| Field | Authoritative source | Secondary evidence |
|---|---|---|
| Program, mint, authority, extension, balances, curve/pool, confirmed fill | Fresh canonical Solana chain state | Helius/Solscan/Birdeye/GMGN parsing may accelerate discovery |
| Pump instruction/account semantics | Pinned official Pump.fun IDL/program version | Provider labels |
| Executable price/cost | Fresh route response plus exact build/simulation and confirmed deltas | Birdeye/GMGN spot/market data |
| Wallet PnL | Our point-in-time confirmed-flow ledger | Birdeye/Cielo/GMGN/Solscan estimates |
| Entity identity | Typed evidence graph with edge-specific confidence | Provider tags and human review |
| Social relevance | Exact mint-linked, timestamped source records | Aggregated trend scores |

Two providers that derive from the same upstream source are not independent. Agreement never converts an opaque label into an on-chain fact.

## Model output contract

Every model output carries:

- model/data/feature versions and training cutoff;
- prediction, calibrated uncertainty and applicable venue/stage/regime;
- missingness and out-of-distribution indicators;
- the most material supporting and contradicting features;
- promotion status from `config/evidence-registry.v1.json`;
- an abstention reason when outside validated scope.

## Intent and reconciliation state machine

`created → evaluated → paper_approved → quoted → simulated → signed → submitted → processed_provisional → confirmed → finalized`

Terminal alternatives are `rejected`, `abandoned`, `simulation_failed`, `expired`, `dropped`, `landed_failed`, `reorged`, `exit_failed` and `reconciled_with_exception`. A submit response or signature never creates a fill. Idempotency keys bind one intent to its allowed transaction/signature set.

## Kill conditions

Fail closed on stale/lagging sources, incoherent slot lineage, critical provider disagreement, unsupported program/extension, simulation mismatch, fee/tip/impact breach, duplicate intent, signer-policy fault, repeated landing or exit failure, ledger mismatch, drawdown/tail-risk breach, or an unavailable manual kill mechanism.

## Implementation acceptance

The master executor is not complete until tests prove:

- future data cannot enter a decision-time feature;
- every rejection and abstention is machine-readable and auditable;
- related accounts cannot satisfy independent-wallet consensus;
- quote/simulation/submission never appear as fills;
- exact fee and balance deltas reconcile paper positions;
- all unvalidated rules are prevented from live authorization;
- signer tests reject arbitrary transfers, unknown programs and excess notional;
- replay can deterministically reproduce a decision from versioned evidence.

