# Research and calibration protocol v1

Status: **LIVE-LOCKED**  
Research cutoff: 2026-09-04

This protocol turns external research into testable project instructions. Literature selects candidate mechanisms and failure controls; it does not supply permanent numeric buy thresholds. Every numerical parameter must be estimated from point-in-time Solana data and survive later, untouched evaluation.

See [EVIDENCE_LEDGER.md](EVIDENCE_LEDGER.md) for claims, counterevidence, limitations, and sources. See `config/evidence-registry.v1.json` for the machine-readable rule classification.

## Master research question

For an opportunity observed at time `t`, estimate all three quantities without using information published after `t`:

1. `p_adverse`: probability of a predeclared severe adverse outcome, including manipulation, unsellability, liquidity collapse, or extreme drawdown.
2. `net_return_distribution`: distribution of realized follower returns after every cost, failed attempt, exit constraint, and latency effect.
3. `p_execution`: probability the exact intended route lands within its validity and risk limits.

A low `p_adverse` is not positive expectancy. A leader's profit is not the follower's profit. A quote, simulation, signature, RPC response, or accepted bundle is not a fill.

## Required system layers

| Order | Layer | Responsibility | May authorize a trade? |
|---:|---|---|---|
| 1 | Canonical state | Decode official program, mint, curve/pool, authority, extension and reserve state | No |
| 2 | Data integrity | Enforce event time, observation time, freshness, lineage, provenance and source health | Can veto only |
| 3 | Protocol safety | Reject unsupported programs, token behavior, transaction shapes and signer requests | Can veto only |
| 4 | Manipulation risk | Estimate adverse-outcome probability from creator/entity, concentration, bundle, wash, liquidity and path features | Can veto/penalize only |
| 5 | Entity quality | Estimate point-in-time wallet/entity skill, persistence, integrity and imitation risk | No |
| 6 | Opportunity model | Estimate conditional follower return distribution from organic flow, curve state, breadth, momentum and context | No |
| 7 | Execution model | Estimate route availability, all-in cost, landing, shortfall, failure and exit feasibility | Can veto only |
| 8 | Deterministic policy | Apply risk budget and require positive conservative net utility | Paper only |
| 9 | Reconciliation | Derive fills from confirmed chain deltas and maintain audit/portfolio state | No new intent |

The model layer never possesses signing material and never emits arbitrary instructions. Only a deterministic allowlisted transaction builder may request a signature from a separate balance-capped signer.

## Point-in-time dataset contract

Every observation must include:

- canonical mint, venue, stage, program IDs, account keys, slot and commitment;
- source event time and slot;
- provider receipt time and source/provider version;
- normalized feature computation time and feature-code version;
- decision, quote/build, signing, submission, landing, confirmation and finality times;
- the raw evidence pointer and a content hash sufficient to reproduce the normalized record;
- availability flags, staleness, disagreement and missingness instead of silently filled values.

The universe must retain failed launches, unmigrated launches, rugged/delisted tokens, frozen or unsellable tokens, failed transactions, abandoned intents and failed exits. Do not train only on assets that survive or migrate.

## Label contract

Labels are versioned and horizon-specific:

| Label | Definition requirement | Forbidden shortcut |
|---|---|---|
| Adverse outcome | Objective on-chain conditions over a declared horizon; report each cause separately | Provider `risk` badge as ground truth |
| Net follower return | Confirmed wallet deltas minus every fee/tip/cost, with failed attempts and exit failures included | Leader PnL, peak return, quote output, graduation |
| Execution success | Confirmed intended state change within the declared block-height/price/risk bounds | RPC or bundle acceptance |
| Drawdown/tail | Mark-to-executable-exit path using contemporaneous depth and fees | Candle high/low without executable size |

Do not collapse inactivity, intentional fraud, organic loss and execution failure into one label during diagnosis. An aggregate risk label may be derived only after the components remain observable.

## Feature families to construct

### Protocol and sellability

- owner program, mint/freeze/close authorities, Token-2022 extensions and configuration authorities;
- transfer fees now and pending, permanent delegate, transfer hook, pausable/default state, non-transferability and confidential state;
- exact canonical Pump.fun curve or PumpSwap pool relationships and migration state;
- exact entry simulation and an executable sell-path simulation where applicable;
- recognized program/instruction/account allowlist result.

These are current capabilities and states, not moral labels. Unsupported or opaque behavior fails closed.

### Organic flow and market structure

- curve progress and real/net SOL inflow velocity per second, slot, event and trade;
- unique buyer/seller counts after entity adjustment, retention and repeat participation;
- buy/sell count and notional imbalance, trade-size distribution and concentration;
- depth at multiple executable sizes, spread/impact, liquidity changes and pool fragmentation;
- multi-horizon return, volatility, drawdown, reversals, price/volume regularity and dump events;
- holder growth relative to price/liquidity and from a non-negligible baseline.

Velocity is valuable only as an interaction: rapid progress with broad unrelated participation differs from rapid progress caused by a few related large buyers.

### Entity and manipulation

- creator, funder, deployer, LP, profit-recipient and prior-launch outcomes known before `t`;
- typed edges for same transaction, same Jito bundle, direct transfers and same funder;
- service/exchange exclusions and edge-specific confidence; never blindly union all relationships;
- raw and entity-adjusted top-holder/early-buyer inventory and change through time;
- wash/self-swap/round-trip evidence, bump/comment-bot evidence and coordinated exits;
- wallet realized closed-position expectancy, dispersion, t/uncertainty measures, drawdown, holding time, exit quality, activity and sample breadth;
- follower-specific imitation penalty, leader exit latency and evidence of sell-only consolidation nodes.

All wallet PnL is recomputed from our own ledger where possible. Birdeye, Cielo, GMGN and Solscan values are timestamped third-party observations, not canonical truth.

### Social context

- unexpected attention change by horizon, credible independent author breadth and cross-community dispersion;
- account age/quality, repeated text/temporal coordination, bot likelihood and official-versus-user-generated origin;
- semantic relevance to the exact mint, not ticker text alone;
- decay since the attention event and whether market movement preceded the posts.

Social evidence is feature-only and can never bypass on-chain, manipulation, liquidity or execution gates.

## Research sequence

1. **Baseline:** deterministic safety gates plus simple, regularized and interpretable models.
2. **Risk model:** calibrated logistic/GAM and tree baseline for each venue/stage; evaluate rare-event precision-recall and probability calibration.
3. **Entity model:** shrink wallet/entity history toward the population mean; use only closed, prior outcomes and preserve uncertainty for small samples.
4. **Opportunity model:** predict multiple net-return quantiles or a distribution, not a single winner/loser label.
5. **Execution model:** estimate landing, delay, realized shortfall, fee/tip and exit failure conditional on route, size, age, liquidity and regime.
6. **Interaction tests:** predeclare and ablate at least velocity × breadth × concentration; wallet quality × copy delay; momentum × liquidity; social attention × bot likelihood.
7. **Ensemble:** allow nonlinear or multimodal models only when they beat simpler baselines on untouched periods and improve economic results after all costs.

An LLM may extract structured claims from unstructured comments/posts and create human-readable explanations. A deterministic or calibrated statistical layer makes the numerical decision. Raw LLM token probabilities are not accepted as calibrated trade probabilities without project-specific validation.

## Split and leakage controls

- Split by time: train, tune, then test on later untouched blocks/days. Use rolling or expanding walk-forward windows.
- Purge observations whose outcome horizons overlap a test fold and embargo the boundary.
- Add grouped stress tests that hold out recurring creator, funder, bundle and entity clusters.
- Freeze universe construction, features, labels, costs, thresholds and code before each out-of-sample window.
- Keep one final untouched holdout. Opening it retires it; it cannot be reused for tuning.
- Record every tried rule/model/threshold, including failures, to measure selection bias.

Random cross-validation alone is prohibited for time-dependent performance claims.

## Replay and paper execution model

Replay the complete causal path:

`chain event → provider receipt → feature computation → decision → quote/build → sign → submit → land → confirm/finalize → exit`

For every attempt include:

- Pump/PumpSwap/Jupiter/creator/platform/LP fees effective at that historical time;
- priority fee, Jito or Sender tip, ATA/rent/wrapping costs and fees on failures;
- quote expiry, blockhash validity, route availability, price impact, slippage rejection and quote-to-land drift;
- provider lag/gaps/outages/rate limits, simulation failure, dropped/expired/landed-failed transactions and retries;
- sandwich/adverse-selection stress, inability to sell and delayed/partial exit at executable size;
- locked capital, duplicate prevention and portfolio opportunity cost.

Fill and P&L accounting comes from confirmed pre/post wallet balances and transaction metadata, never from expected quote fields.

## Metrics and falsification

Report at least:

- risk-model AUPRC, precision/recall at the operating point, Brier score/calibration curve, false-negative rugs and abstention coverage;
- net expectancy and its block/cluster-bootstrap confidence interval, median and quantiles;
- realized shortfall, landing/failure/expiry/unsellable-exit rates and cost decomposition;
- turnover, exposure, profit factor, maximum drawdown, time under water and CVaR/tail loss;
- performance by venue, stage, token age, liquidity, route, source health and market regime;
- feature/model ablations and provider-disagreement outcomes;
- Deflated Sharpe or another predeclared multiple-testing correction, Probability of Backtest Overfitting where applicable, and the full trial count.

Falsify a feature when its effect changes sign, loses calibration, disappears on unseen entities/periods, or fails after realistic costs. Demote it rather than rationalizing the miss.

## Promotion states

1. `RESEARCH_ONLY`: source-backed candidate, not allowed to affect an order.
2. `PAPER_ONLY`: implemented point-in-time with tests; may affect simulated decisions.
3. `REPLAY_VALIDATED`: passes predeclared chronological and grouped holdouts with reproducible artifacts.
4. `PROSPECTIVE_VALIDATED`: frozen candidate passes shadow/paper operation on future data and stressed costs.
5. `LIVE_CANDIDATE`: eligible for a separate owner review; it does not enable live trading.

Promotion requires all of the following, not merely a positive mean:

- positive lower confidence bound for net out-of-sample expectancy under normal and stressed costs;
- acceptable probability calibration and costly-error rates;
- multiple-testing/backtest-overfitting controls pass;
- drawdown and tail loss remain inside a predeclared capital risk budget;
- no critical security, signer, reconciliation, duplication or sellability defect;
- reproducible data/model/policy hashes and immutable decision logs;
- prospective performance has not materially decayed.

The existing `100 signals / 7 days` policy is only a pipeline smoke-test minimum. It cannot by itself confer `LIVE_CANDIDATE` status. Sample sufficiency must follow uncertainty, dependence, market-regime coverage and minimum-track-record analysis rather than an invented universal count.

## Drift and rollback

- Monitor feature distribution, missingness, calibration, realized shortfall, failure rate, venue mix and entity turnover.
- Retrain on a declared cadence only; emergency threshold changes create a new version and restart prospective validation.
- Automatically demote on stale data, source divergence, calibration breach, excess failure/shortfall, ledger mismatch or risk-limit breach.
- Preserve the prior model, data window, source versions, trial record and rollback reason.

## Subscription rule

Provider upgrades follow measured ingestion gaps, rate-limit saturation, latency, historical-data needs or redundancy requirements. No subscription is purchased or upgraded because a paper mentions the provider, and no paid plan is counted as evidence of predictive edge.


