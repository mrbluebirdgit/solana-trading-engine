# Audit of supplied meme-coin recommendations

Audit date: **2026-09-04**  
Disposition: **feature ideas retained; claimed universal formula rejected; all numeric presets remain research-only**

## Source-package finding

The uploaded Markdown file is a 65-line README describing a claimed Python repository. It does not contain the referenced `filters.yaml`, scorer, Telegram formatter, listener, paper logger or ZIP. No missing code is treated as implemented. Useful concepts were translated into this repository's existing Node architecture.

## What survives review

The following are defensible feature families when defined precisely and measured point-in-time:

- executed volume, side imbalance and transaction activity by aligned window;
- raw and entity-adjusted trading breadth;
- open-market holder acquisition and holder growth;
- raw, excluded-account and entity-adjusted concentration;
- creator/funder history and typed early-buyer clusters;
- executable size-specific entry and exit impact;
- mint, freeze, token-extension, pool and sellability checks;
- social breadth and velocity as corroboration;
- follower-specific latency, cost and crowding rather than leader headline PnL;
- risk governors, idempotent exits, reconciliation and fail-closed critical data.

Research supports measuring these dimensions. It does not validate the supplied numbers as a permanent profitable strategy.

## Corrections incorporated

| Supplied claim | Audit result | Engine treatment |
|---|---|---|
| “Traffic is not website visits” | Too absolute: market participation is central, while page/community activity can still be an attention input | Use `market participation and attention`; keep web attention separate from on-chain breadth |
| “Price is the noisiest signal” | Unsupported superlative | Price alone is insufficient; retain multi-source price/volatility context |
| Volume is raw demand | Incorrect | Treat volume as turnover; pair with entity breadth and wash/circular-flow evidence |
| Makers are an anti-wash metric | Overstated | Raw wallets are Sybil-vulnerable; report raw and entity-adjusted breadth |
| A fixed maker count drives DexScreener trending | Unsupported | DexScreener publishes inputs, not weights/cutoffs; paid boosts also affect score |
| Top ten below 20–30% is generally safe | Vendor/desk heuristic | Measure multiple concentration views; calibrate phase-specific cutoffs locally |
| Same-slot buyers are one bundle/operator | Unsupported inference | Store a `same_slot_candidate` cohort; require exact Jito or independent linkage for stronger evidence |
| Jito tip transfer or returned bundle ID proves exact membership | Incorrect | Require landed status, landing slot, one to five included signatures, and explicit launch-activity and buy-activity confirmation; tip adjacency or receipt alone is insufficient |
| Generic `bundle_pct` is comparable across tools | Incorrect | Keep independent launch cohorts separate from `providerLabels`; preserve each denominator and method version |
| GMGN `bundler_rate` is a trading-volume share | Not supported consistently by GMGN's own references | Preserve it as a provider-defined ratio with an unspecified denominator; map only `bundler_trader_amount_rate` to trading-volume share |
| Wallet age is wallet creation time | Not observable | Use first observed on-chain activity and label it accordingly |
| Fixed ~$69k / ~85 SOL Pump graduation | Current default-SOL configuration shorthand, not universal | Deprecate it as a stage classifier; resolve quote mint, config, curve `complete` state and canonical pool from chain |
| Curve completion automatically means migration | Incorrect | Treat `complete = true` with no canonical pool as `migration_pending`; current migration is a separate permissionless/idempotent operation |
| Current canonical Pump migration may go to Raydium | Outdated | Verify canonical PumpSwap migration; the legacy Raydium withdrawal path is disabled and third-party pools remain distinct |
| “LP burned” proves the migrated pool is safe | Overstated | Canonical migration burns its initial LP issuance, but later deposits can mint/redeem LP; verify the canonical pool and migration event rather than a generic current badge |
| Mint/freeze authority is revoked or `N/A` on a curve | Incorrect | Authority state remains applicable at every stage; active authority is active, and unavailable data stays unknown |
| 15–25% slippage is a normal fresh-launch target | Unsafe framing | Use adaptive quote/build logic plus a maximum all-in loss budget; skip when the required tolerance is excessive |
| Fixed Jito tips of 0.005–0.1 SOL | Not defensible | Estimate the local fee/tip market and cap total execution cost as a fraction of notional/risk budget |
| Social generally leads price | Not established | Model lead/lag and reverse causality; social cannot authorize a trade |
| 2–5% engagement is healthy; below 1% means bots | Unsupported universal bands | Retain raw interaction types and a calibrated probabilistic automation model |
| Graduation equals a safe/winning coin | False target equivalence | Separate graduation, adverse outcome, follower return and execution probability |

## Numeric preset disposition

| Preset group | Examples supplied | Status |
|---|---|---|
| Visibility/breadth | 100, 300–500, 1,000+ makers | `USER_SUPPLIED_HYPOTHESIS`; no published outcome-calibrated boundary found |
| Absolute liquidity | $20k, $50k, $150k, $500k–$2M | `USER_SUPPLIED_HYPOTHESIS`; replace as gate with intended-size executable entry/exit quotes |
| Concentration | top ten 20–30%; dev 5–10%; sniper/bundle bands | Useful features; exact cutoffs remain paper-test parameters |
| Phase filters | market cap, age, volume, holder and smart-wallet counts | Desk/vendor examples; not official Axiom/GMGN optimums |
| Curve ladder | add 6–50%; trim 55–65% and 70–80% | Payoff hypothesis; backtest against follower fills and current curve version |
| Migration/post-grad | 200 holders, $50k liquidity, 10–30% liquidity/MC, $80k volume | Historical/contextual hypotheses, not invariants |
| Copy trading | 30 trades, 7 days, 40–70% wins, 10–20% leader size | Statistically insufficient or size-insensitive; replace with shrinkage, expectancy, latency and follower impact |
| Stops/exits | -30% to -50%, 2x/5x/10x ladders, 6–12h timeout | Risk/payoff designs only; on-chain triggers do not guarantee fills |
| Portfolio | 5–10 names, -5% to -10% daily kill | Governance candidates; must reflect cluster correlation and tolerable drawdown |

The values are preserved in `config/hypothesis-candidates.v1.json` as 85 unvalidated, phase-scoped replay/paper candidates plus two unimplemented exit-ladder candidates. No value is selected or active, and none was copied into `config/traffic-feature-catalog.v1.json` as a threshold or score weight. The registry attributes those values to the in-chat intake; the separate 65-line attachment hash is not misrepresented as their source.

## Direct evidence that changes the interpretation

- MELT studied 41,470 migrated Pump.fun launches and found behavioral, concentration and bundle-derived features useful for a high-risk label. It is a preprint, migrated-only, based on an older regime and does not publish universal decision cutoffs.
- A separate study of 655,770 launches found faster progression with fewer curve updates predicted graduation, yet simple conditioned buy-and-hold strategies did not clear the paper's breakeven. Graduation probability is not follower profitability.
- A newer 832,941-launch preprint reports a strong association between advertised Telegram presence and rapid-window graduation, but its post-publication audit found only about six minutes of effective collection coverage. It explicitly cannot establish a true 24-hour graduation rate, and it does not establish post-graduation net returns.
- Current Pump documentation supports SOL and USDC quote mints and versioned fee schedules. Roughly $69k/~85 SOL remains recognizable current default-SOL configuration shorthand, but it is not a protocol invariant and cannot classify stage.
- Current Pump documentation separates `complete` curve state from permissionless/idempotent PumpSwap migration. The canonical legacy Raydium withdrawal path is disabled. Initial migration LP issuance is burned, but later PumpSwap participants can mint and redeem LP tokens.
- Solana token authority state does not become not-applicable on a bonding curve. Mint and freeze authorities must be read directly and preserved as unknown when collection fails.
- Jito documents bundles as one to five ordered transactions within one slot and states that receipt of a bundle ID does not guarantee landing. Exact Jito evidence in this engine therefore includes landed status, landing slot, one to five transaction signatures, `containsLaunchActivity = true` and `containsBuyActivity = true`.
- GMGN's published references describe `bundler_rate` inconsistently, while `bundler_trader_amount_rate` is explicitly tied to trading volume. Those fields cannot share one normalized denominator.
- Jupiter documents slippage as dependent on volatility, size relative to liquidity and quote-to-execution delay. This directly contradicts treating one static tolerance as optimal.

## What was implemented from the review

- the `TrafficSnapshot` schema and validators for aligned windows, point-in-time provenance and null-preserving missingness;
- a live-locked feature catalog with no embedded buy thresholds or score weights;
- separate raw/entity breadth and raw/entity concentration fields;
- an explicitly typed input contract for launch cohorts, landed Jito evidence and separate provider labels instead of one bundle percentage;
- explicit executable buy and sell impact fields for the intended notional;
- canonical venue-stage predicates that cannot be inferred from market cap;
- social velocity that may accelerate or decelerate and cannot produce a verdict;
- tests that reject future provenance, impossible entity counts, conflated Jito evidence and runtime authority.

The canonical Pump/PumpSwap stage resolver, a read-only Helius point collector, a live-locked Pump log observer, and an append-only observation ledger are implemented. Durable traffic collectors, launch-cohort reconstruction, canonical migration-LP evidence collection, transactional paper-state persistence, and an actual always-on deployment are not. The schema can reject malformed or conflated evidence; it cannot make absent collection logic true.

## Next empirical work

1. Harden and validate the current Pump/PumpSwap log classification, mint resolution, and canonical stage collection against recorded fixtures and program changes.
2. Add durable Helius/Birdeye traffic collectors with source timestamps, aligned windows, token/pair scope, gap detection, and replay.
3. Build the point-in-time wallet/entity ledger and explicit launch cohorts.
4. Record intended-size Jupiter/direct entry and exit quotes and simulated cost.
5. Define target labels and observation horizons before fitting anything.
6. Replay and paper-run; then estimate phase-specific cutoffs rather than selecting them from anecdotes.

Until those steps produce reproducible out-of-sample evidence, the correct output is research telemetry and paper alerts—not an autonomous live buy.
