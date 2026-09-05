# Evidence ledger v1

Research cutoff: **2026-09-04**  
Runtime effect: **none until implemented and validated in paper mode**  
Live status: **locked**

This ledger records why a rule exists, how strong its support is, what the evidence does not prove, and what must be tested locally. It is not a collection of copied trading rules and it makes no claim of guaranteed profit.

## Evidence classes

| Class | Meaning | Allowed use |
|---|---|---|
| `PROTOCOL_FACT` | Behavior defined by deployed protocol/API semantics | Supports validation and state interpretation |
| `ENGINEERING_INVARIANT` | Fail-closed control derived from security/reliability mechanics | Hard gate once implemented and tested |
| `EMPIRICAL_FEATURE` | Direction or interaction supported by a study but not portable numeric cutoffs | Research, then calibrated paper feature |
| `RISK_GUARDRAIL` | Conservative owner/project boundary; not claimed return-optimal | Deterministic cap |
| `UNVALIDATED_HYPOTHESIS` | Plausible current value/weight without adequate external validation | Research/paper only |
| `REJECTED_SHORTCUT` | Equivalence contradicted by mechanics or evidence | Forbidden |

The machine-readable classification is in `config/evidence-registry.v1.json`.

## What the research supports

| Mechanism | Evidence and result | Transferability / limitation | Engine instruction |
|---|---|---|---|
| Entity-adjusted concentration | [MELT](https://arxiv.org/html/2602.13480v2) covers 41,470 migrated Pump.fun launches and 218.5M transactions. Co-purchase, funding and Jito-bundle relationships exposed bundled accounts holding 36.5% of supply; entity adjustment raised median top-10 concentration much more in its high-risk class. | Recent preprint; migrated-only survivorship; inferred labels; older Raydium-migration era. Public assets are [CC BY-NC 4.0](https://github.com/git-disl/MELT), so commercial reuse needs permission. | Build typed entity edges and compare raw with entity-adjusted concentration. Reproduce on current data; do not copy code/data or thresholds into production. |
| Early adverse-outcome features | [Catching the Rug](https://arxiv.org/html/2608.20271v1) analyzes about 6.4M tokens. First-five-minute flow, participant, price and timing features had predictive value; rolling evaluation found severe cross-DEX domain shift. | New preprint; severe TVL decline/inactivity is not identical to fraud; authors say it is not deployment-ready. | Separate risk models by venue/stage and calibrate on current Pump/PumpSwap data. |
| Solana rug mechanisms | [From Hype to Collapse](https://arxiv.org/html/2603.24625v2) documents freeze-authority abuse, liquidity withdrawal, pump/dump behavior, short lifecycles and organized address clusters from 117 confirmed cases and a 100,063-token scan. | High-precision heuristics can miss slower attacks; not a return model; limited current PumpSwap coverage. | Inspect authority/current liquidity and preserve creator, funder, LP and profit-recipient history as risk evidence. |
| Curve velocity | [The Pump.fun case](https://arxiv.org/html/2602.14860v1) reconstructs 655,770 September-2025 launches. At equal curve progress, faster liquidity accumulation through fewer swaps predicted graduation. | Graduation was only 0.63% and is not net follower profit. One month; bot classification is imperfect. | Rank net inflow velocity, but only as an interaction with independent breadth and concentration. |
| Wallet history | The same [Pump.fun study](https://arxiv.org/html/2602.14860v1) used a prior two-week wallet-selection window and found at most modest/non-monotonic graduation uplift; some high-PnL wallets were sell-only aggregation nodes. [A Pump copy-trading study](https://arxiv.org/html/2601.08641v2) reports wallet features matter but followers pay a structural imitation penalty. | Both are recent preprints; leader profitability can be insider flow or luck; reported follower performance is not independent live proof. | Recompute only prior closed-position results; distinguish buyers from exit nodes; shrink small samples; model follower costs independently. |
| Manipulative bots | The [copy-trading study](https://arxiv.org/html/2601.08641v2) finds bundle/bump/comment/sniper signals interact with wallet and token outcomes; sniper presence alone had limited measured impact. | Heuristic/LLM labels and one historical sample. Some attention manipulation correlated with short-term growth. | Use bot evidence as contextual features. Never equate first-block participation or any single bot label with fraud. |
| Growth authenticity | [A Midsummer Meme's Dream](https://arxiv.org/html/2507.01963v2) finds widespread artificial-growth patterns among high-return cross-chain memecoins. | Selected subgroups and heuristic detection; not a forward profitability test. | Reward price/volume/holder/social growth only when funding diversity, wash tests, entity concentration and executable depth suggest organic demand. |
| Momentum | [A Trend Factor for the Cross Section of Cryptocurrency Returns](https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/trend-factor-for-the-cross-section-of-cryptocurrency-returns/4C1509ACBA33D5DCAF0AC24379148178) supports price/volume/volatility trend features on broader crypto. [Cryptocurrency momentum has (not) its moments](https://link.springer.com/article/10.1007/s11408-025-00474-9) finds instability and crash-prone results. | Days/weeks and more liquid assets do not validate seconds/minutes on Pump.fun. | Conditional feature only; stratify by horizon/regime and never bypass liquidity/tail-risk gates. |
| Social attention | [CFR working paper 25-02](https://cfr-cologne.de/download/workingpaper/cfr-25-02.pdf) reports a short-lived next-day association. [PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0284501) finds non-linear engagement relationships; Pump comments can be automated. | Mostly daily data; reverse causality, ticker ambiguity and bots; no minute-scale Solana proof. | Mint-linked, decaying, bot-filtered corroborative feature only. Social activity cannot authorize a trade. |
| Failed transactions | [Why Does My Transaction Fail?](https://arxiv.org/html/2504.18055v1) analyzes 2.898B historical non-vote transactions; classified bots had a 58.43% failure rate and failed attempts still paid fees. | Historical program mix; bot classifier uncertainty; rate will drift. | Failures, expiry and paid fees are first-class replay outcomes; calibrate from our telemetry. |
| Sandwich/MEV | [Quantifying the Threat of Sandwiching MEV on Jito](https://doi.org/10.1145/3730567.3764493) measures 521,903 instances over four months and at least $7.7M in victim losses. | Jito-focused historical window and lower-bound loss estimate. | Include MEV/tail stress and conservative slippage; protected/bundled submission is not immunity. |
| Backtest selection | [Probability of Backtest Overfitting](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253) and [Deflated Sharpe Ratio](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551) show why testing many variants inflates results. | Methods must respect blocked/dependent time-series data. | Log every trial; use chronological/purged evaluation, an untouched holdout and a predeclared multiple-testing correction. |

## Market-participation intake audit

The September 2026 recommendation intake correctly identifies a useful multi-dimensional feature stack, but its exact maker, holder, concentration, liquidity, phase, copy, slippage, tip, exit and loss thresholds are practitioner hypotheses rather than validated laws. They are preserved in [the supplied-recommendation audit](SUPPLIED_RECOMMENDATION_AUDIT.md), while the code-facing [traffic feature specification](TRAFFIC_FEATURE_SPECIFICATION.md) contains no buy cutoff or score weight.

Additional findings incorporated into the contract:

- [DEX Screener](https://docs.dexscreener.com/api/reference) exposes pair volume, transactions and liquidity, but its public pair API does not document unique makers. Its [Trending](https://docs.dexscreener.com/trending) inputs and paid [Boosts](https://docs.dexscreener.com/boosting) mean no public maker threshold can be represented as a proven ranking rule.
- [Birdeye](https://data.birdeye.so/docs/data-api/stats/get-defi-v3-token-trade-data-single) exposes token/pair flow and unique-wallet windows, while its holder APIs distinguish wallet and token-account modes. Scope, denominator and window must accompany every value.
- GMGN and Axiom use different bundle definitions and denominators. GMGN documentation is not consistent enough to assign `bundler_rate` a canonical denominator, while `bundler_trader_amount_rate` is explicitly a trading-volume ratio. The engine preserves those as separate `providerLabels`, outside independently reconstructed launch cohorts, and separately measures same-slot candidates, landed exact-Jito cohorts, funding-linked clusters, supply share and retained supply.
- [Jito](https://docs.jito.wtf/lowlatencytxnsend/) defines bundles as one to five ordered transactions in one slot. For this engine, exact Jito evidence requires landed status, landing slot, one to five included transaction signatures, `containsLaunchActivity = true` and `containsBuyActivity = true`. A returned bundle ID or nearby tip is only submission/adjacency evidence, not landing, common ownership or malicious intent.
- Current [Pump fees](https://pump.fun/docs/fees) document SOL and USDC quote mints and mutable fee schedules. Roughly $69k/~85 SOL remains shorthand associated with the current default-SOL curve configuration, not a universal protocol invariant, and it is deprecated as a lifecycle-stage classifier. Stage must come from program/account state interpreted against a recorded IDL reference.
- Pump curve completion and migration are separate facts. The current canonical migration to PumpSwap is permissionless and idempotent; it is not an automatic state transition that can be assumed from `complete`. The legacy canonical Raydium withdrawal path is disabled.
- Current canonical Pump migration burns the initial LP issuance. Later PumpSwap liquidity deposits can mint LP and withdrawals can redeem it, so a generic present-time LP burn/supply badge is insufficient; verify the canonical pool and the migration mint/burn event.
- Active mint or freeze authority is never `N/A` merely because the token is on a bonding curve. Read it from canonical state; unavailable data remains unknown and fails closed where policy requires it.
- [Jupiter](https://developers.jup.ag/docs/swap/advanced/slippage) states that slippage depends on volatility, trade size versus liquidity and quote-to-execution delay. Static 15–25% tolerances and fixed Jito tips are not accepted defaults.
- A corrected 2026 [Graduation Regime Windows](https://arxiv.org/abs/2607.02823v3) preprint finds a strong Telegram-presence association with rapid-window graduation, but its effective coverage was about six minutes and graduation is not follower profit. Social presence remains a target-specific, corroborative feature.

## Protocol facts and hard controls

- Solana [token](https://solana.com/docs/tokens), [freeze-account](https://solana.com/docs/tokens/basics/freeze-account), and [Token-2022](https://www.solana-program.com/docs/token-2022) documentation defines authority and extension capabilities. Active mint or freeze authority, permanent delegate, transfer hook, transfer fee, pausing or non-transferability is factual state at every venue stage; excluding a capability is a risk policy, not a fraud verdict.
- Pump.fun's [official public docs and IDLs](https://github.com/pump-fun/pump-public-docs) define the program accounts, curve completion, permissionless/idempotent PumpSwap migration and canonical-pool relationships. Resolve `pump_curve_active` from `complete = false`, `migration_pending` from `complete = true` with no canonical PumpSwap pool, and `pumpswap_amm` only when that pool exists. Verify relationships from chain data, record the reviewed IDL commit, and revalidate after upgrades.
- [`simulateTransaction`](https://solana.com/docs/rpc/http/simulatetransaction) is a point-in-time check. [`sendTransaction`](https://solana.com/docs/rpc/http/sendtransaction) acceptance is not confirmation; reconcile through [`getSignatureStatuses`](https://solana.com/docs/rpc/http/getsignaturestatuses) and confirmed/finalized transaction metadata.
- Jupiter [Swap](https://developers.jup.ag/docs/swap) quote/order values are expectations until execution and reconciliation. Keep price impact, slippage, route fees, tips and quote-to-land drift separate.
- Jito's [send documentation](https://docs.jito.wtf/lowlatencytxnsend/) says its low-latency send path skips preflight and acceptance is not landing. Independently simulate the exact final transaction before signing, then poll and reconcile.
- Helius [streaming](https://www.helius.dev/docs/data-streaming) and [Sender](https://www.helius.dev/docs/sending-transactions/sender) are acquisition/submission capabilities. They improve observability or landing paths; they are not alpha evidence.

The repository now contains structural `TokenObservation` and `TrafficSnapshot` validation, the canonical Pump/PumpSwap stage resolver, a read-only Helius point collector, a live-locked Pump log observer, and an append-only observation ledger. Durable market-traffic collection, launch-cohort reconstruction, canonical migration-LP evidence collection, transactional paper-state persistence, and an actual always-on deployment remain unimplemented. This ledger does not claim those missing facts are already being collected.

## Reconciliation of apparently conflicting findings

Fast curve progress can predict graduation while fast, thin sales dominated by a few related buyers can predict collapse. Therefore the positive feature is not raw speed. Test the interaction:

`organic_velocity = net_inflow_velocity × independent_buyer_breadth × (1 − entity_adjusted_concentration) × authenticity_confidence`

This expression describes a mechanism to test, not a production coefficient formula. Each component, transform and threshold must be learned inside training data and tested later.

Similarly, a profitable wallet can be valuable evidence while copying that wallet can be unprofitable after its price impact and exit. The system must predict follower return after observation delay, not reuse leader return.

## Audit of current numerical policy

| Existing item | Classification | Consequence |
|---|---|---|
| $10k Tier A/B alert | Unvalidated numerical hypothesis | Paper/research only; calibrate precision, capacity and decay |
| 15-second age; 15% chase | Unvalidated execution priors | Learn opportunity decay from observed leader-to-follower paths |
| 2% impact; 8% maximum slippage | Conservative risk guardrails, not optimal targets | Model all-in loss and failure trade-off by size/liquidity/regime |
| 30 SOL liquidity; 25% top-10; 10% related early holders | Supported feature families with unvalidated cutoffs | Re-estimate by venue/stage and entity-adjusted data |
| $3M market cap; three independent Tier-A entities | Unvalidated hypotheses | Cannot authorize live execution |
| 10x volume; 30% holder growth | Unvalidated thresholds on supported features | Keep as research flags; test organic-growth interactions |
| Entity weights and 75/60 tiers | Unvalidated scoring hypothesis | Replace/augment with calibrated point-in-time probabilities and uncertainty |
| 100 signals / seven days | Pipeline smoke-test floor only | Cannot unlock live; use confidence, dependence, regime coverage and prospective results |
| Position/exposure/loss caps | Risk-governance guardrails | Retain conservatively; calibrate to explicit ruin/drawdown budget before any live proposal |
| Key isolation, recognized instructions, exact simulation, reconciliation, no leverage/borrowing/martingale | Engineering controls | Keep deterministic and fail closed |

## Definitive limits

- No cited study validates a permanent, universally profitable Pump.fun buy formula.
- No provider's proprietary `smart money`, `insider`, `organic`, `security` or PnL label is ground truth without raw, point-in-time evidence.
- No amount of API capacity substitutes for implementation, calibration or prospective validation.
- Published numeric thresholds and performance cannot be transplanted across venue, program version, market regime, latency or trade size.
- Research can justify what to measure and how to test it. Only reproducible project data can calibrate when the engine should act.
