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
7. Build a point-in-time `TrafficSnapshot`, compute organic-flow/context features, and estimate the engine's `net_return_distribution`, including imitation delay only when wallet evidence nominated the candidate.
8. Request independent executable routes and compute `p_execution` plus all-in cost/shortfall distribution.
9. Apply portfolio, concentration, notional, fee/tip, drawdown, duplication and kill-switch gates.
10. Emit one decision with complete reasons: `REJECT`, `ALERT_ONLY`, or `PAPER_ELIGIBLE`.
11. Advance an explicitly simulated paper lifecycle and record modeled fills and costs without signing or submitting a chain transaction.

There is intentionally no live decision state in v1. The current evaluator emits only `REJECT` and `ALERT_ONLY`; `PAPER_ELIGIBLE` is reserved and remains unreachable until the scorer, paper executor, and required evidence layers exist. A future policy version may add `LIVE_CANDIDATE` only after the research protocol's promotion gates and a separate explicit owner action. An environment-variable or configuration change alone cannot enable live trading.

## Conservative decision rule

The policy compares the conservative lower bound of the engine's net utility—not headline token return or a watched wallet's return—with zero and the capital risk budget. Net utility includes entry and exit proceeds, every fee/tip, impact, quote-to-land drift, failures, MEV/tail stress, opportunity cost and model uncertainty.

The executor abstains unless:

- every hard protocol/data/signer gate passes;
- the adverse-risk operating point passes for this venue/stage/regime;
- the conservative net-return bound is positive after all modeled costs;
- execution feasibility and an exit path meet the current risk budget;
- portfolio and kill-switch state permit a new intent;
- all required evidence can be reproduced from logged hashes and versions.

No provider score, social trend, wallet label, graduation prediction or LLM output can independently satisfy these conditions.

The market-participation feature contract is defined in `config/traffic-feature-catalog.v1.json`. It is live-locked and contains no buy thresholds or score weights. A generic bundle percentage is forbidden: same-slot cohorts, landed exact-Jito cohorts, funding-linked clusters, supply and retained-supply measures must keep their methods and denominators separate. Any union cohort names its component methods and retains a reference to overlap/deduplication evidence. Provider labels remain outside launch cohorts. In particular, GMGN `bundler_rate` retains an unspecified provider-defined denominator, while `bundler_trader_amount_rate` maps only to provider-classified trading-volume share.

For Pump, stage classification starts only after the exact derived curve/pool identities, explicit existence, program owners, account decodes, mint relationships, and coherent curve fields validate. On that validated state, `pump_curve_active` requires `complete = false`, `migration_pending` requires `complete = true` plus an explicitly absent canonical PumpSwap pool, and `pumpswap_amm` requires the fully decoded canonical pool. Completion and migration are different facts: current migration is permissionless and idempotent, not an automatic consequence that can be inferred from curve completion. Legacy Raydium withdrawal is disabled for the canonical path. The current canonical migration burns its initial LP issuance, but later liquidity providers can mint and redeem LP tokens; generic current LP burn/supply status is therefore not proof of canonical migration or deployer control.

Active mint or freeze authority is never treated as unavailable merely because a token remains on a bonding curve. The engine must read authority state directly and preserve `unknown` when it cannot. The read-only Pump/PumpSwap resolver and Helius point collector populate these stage and authority fields. Durable traffic collection, launch-cohort reconstruction, and canonical migration-LP evidence collection remain unimplemented.

## Source authority hierarchy

| Field | Authoritative source | Secondary evidence |
|---|---|---|
| Program, mint, authority, extension, balances, curve/pool, confirmed fill | Fresh canonical Solana chain state | Helius/Solscan/Birdeye/GMGN parsing may accelerate discovery |
| Pump instruction/account semantics | Recorded, reviewed official Pump.fun IDL reference; revalidate after upgrades | Provider labels |
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

## Paper intent state machine

The v1 paper lifecycle is specified but not implemented:

`created → evaluated → paper_approved → paper_quoted → paper_simulated → paper_recorded`

Paper terminal alternatives are `rejected`, `abandoned`, `simulation_failed`, `expired`, `exit_unavailable`, and `paper_record_exception`. Paper mode never creates a signature, submits a transaction, or represents a simulated result as an on-chain fill. Any future live lifecycle—including signing, submission, confirmation, finality, dropped transactions, and reorg handling—requires a later policy version and separate acceptance tests.

## Kill conditions

Fail closed on stale/lagging sources, incoherent slot lineage, critical provider disagreement, unsupported program/extension, simulation mismatch, fee/tip/impact breach, duplicate intent, signer-policy fault, repeated landing or exit failure, ledger mismatch, drawdown/tail-risk breach, or an unavailable manual kill mechanism.

## Implementation acceptance

The master executor is not complete until tests prove:

- future data cannot enter a decision-time feature;
- every rejection and abstention is machine-readable and auditable;
- related accounts cannot satisfy independent-wallet consensus;
- token accounts are aggregated to economic wallet authorities before holder or maker counts;
- same-slot activity, a tip transfer or a returned bundle ID cannot be represented as exact Jito evidence; exact Jito requires landed status, landing slot, one to five included transaction signatures, `containsLaunchActivity = true` and `containsBuyActivity = true`;
- provider volume ratios cannot be substituted for supply-held bundle metrics;
- provider labels cannot be inserted into independently reconstructed launch cohorts;
- curve completion cannot be represented as completed migration, and generic LP burn status cannot stand in for canonical initial-migration evidence;
- mint and freeze authority cannot be marked not applicable solely because the venue stage is a bonding curve;
- a quote or simulation never appears as an on-chain fill;
- simulated paper positions reconcile from timestamped quote, simulation, fee, and market-state inputs; any future live fill reconciles from exact confirmed fee and balance deltas;
- all unvalidated rules are prevented from live authorization;
- signer tests reject arbitrary transfers, unknown programs and excess notional;
- replay can deterministically reproduce a decision from versioned evidence.
