# Strategy specification v1

Status: **LIVE-LOCKED**

The engine treats the existing opportunity, entity, safety, and portfolio notes as versioned machine-readable policy in `config/policy.v1.yaml`. They are initial hypotheses and conservative safety limits, not a promise of profitability and not assumed to be optimal. `config/evidence-registry.v1.json` now records the evidence class, sources, limitations, calibration state, and falsification test behind each material rule. Performance thresholds may change only through a new policy version and the research process in `docs/RESEARCH_AND_CALIBRATION_PROTOCOL.md`. Live status cannot be enabled by editing this file.

## Decision path

1. Discover candidates across launch and migration activity, market flow, liquidity, holder growth and distribution, token and creator safety, social attention, and explicitly user-approved wallet or entity observations.
2. Establish the token's canonical mint, venue, and bonding-curve or graduated stage.
3. Reconcile on-chain facts and market evidence from at least two independent sources.
4. Score the opportunity across token and market quality, manipulation risk, attention conversion, entity evidence when available, and follower execution viability; count a related-wallet cluster only once.
5. Apply token, freshness, chase, price-impact, slippage, portfolio, and signer gates.
6. Emit `ALERT ONLY`, `TRADE ELIGIBLE`, or a machine-readable rejection reason.
7. Paper-execute with realistic latency, costs, failures, and exit constraints.
8. Remain live-locked until the acceptance gate and explicit activation are both satisfied.

## Master decision contract

The future executor must implement `docs/MASTER_DECISION_CONTRACT.md` and keep three predictions separate:

1. probability of manipulation, fraud, or another adverse event;
2. distribution of the follower's net return after latency, spread, impact, priority fees, tips, failed attempts, and exit constraints; and
3. probability that the proposed transaction lands and reconciles as intended.

The feature layer may test interactions such as liquidity velocity × independent buyer breadth × (1 − entity-adjusted concentration) × authenticity. This is a research hypothesis, not a production formula. A fast curve can be a positive adoption signal or coordinated manipulation; the interaction must distinguish the two through chronological evaluation.

## Evidence governance

Rules are classified as `PROTOCOL_FACT`, `ENGINEERING_INVARIANT`, `EMPIRICAL_FEATURE`, `RISK_GUARDRAIL`, `UNVALIDATED_HYPOTHESIS`, or `REJECTED_SHORTCUT`. Only protocol facts, engineering invariants, and explicitly authorized risk guardrails can become hard gates before local calibration. Empirical features remain model inputs until their net value survives replay, walk-forward testing, unseen-group evaluation, and forward paper trading. Unvalidated hypotheses cannot silently become trade gates, and rejected shortcuts cannot be activated.

## Opportunity rules now encoded

| Family | Initial policy |
|---|---|
| Priority wallet alert | Actual Tier A/B buy of at least $10,000; smaller trades still inform scoring |
| Freshness | Signal data no older than 15 seconds and a fresh quote required |
| Chase protection | Reject when price moved more than 15% since the leader's confirmed fill |
| Execution quality | Reject above 2% estimated impact or above 8% required slippage |
| Graduated liquidity | At least 30 SOL |
| Ownership | Top 10 below 25% after excluding only verified LP/burn/program accounts |
| Coordination | Bundler or related early-holder concentration below 10% |
| Early-growth size | Market capitalization below $3 million unless a separately tested strategy exists |
| Consensus | At least three independent Tier A entities for auto-execution consideration |
| Growth discovery | Greater than 10x volume acceleration and greater than 30% 24-hour holder growth are features, not universal buy rules |
| Paper acceptance | Smoke-test floor only: at least 100 completed eligible signals over at least seven days, positive out-of-sample expectancy after modeled costs, and no critical defects; this never unlocks live trading |

All numeric values in this table remain starting hypotheses or guardrails. None is represented as a research-proven optimum, and none may be tuned on the final holdout.

Bonding-curve candidates do not receive ordinary LP-lock rules. Until reserve thresholds are validated through replay, the earliest/lowest-reserve cases remain alert-only.

## Entity scoring

The 0–100 score assigns 25 points to repeat success across distinct tokens, 20 to realized risk-adjusted results after costs, 15 to early-entry alpha without insider evidence, and 10 each to exit/drawdown quality, recent activity, profit diversification/sample size, and data/entity-link confidence.

- Tier A: 75 or higher plus adequate sample, current activity, positive realized expectancy, acceptable concentration, and no severe integrity flag.
- Tier B: 60–74 or promising but not adequately proven; alert/probation only.
- Tier C: below 60 or otherwise stale, concentrated, unproven, or materially flagged; research only.
- Disqualified: credible insider, creator, wash, bundled, malicious, or follower-dumping evidence.

Wallet activity is one optional evidence family, not the strategy. The repository ships with no static wallet entries. Any future watchlist must be created empty, and each entry requires explicit user approval. Wallet inputs have `candidate_nomination` authority only: an observation or third-party label cannot confer entity rank, copy permission, trade eligibility, or execution authority. Entities are evidence-based clusters; shared exchange funding or buying the same popular token never establishes identity by itself.

## Portfolio and signing limits

- Start any future live phase at 0.25% of the dedicated trading-wallet equity per eligible position.
- Never exceed 1% in one position, three open positions, or 5% total exposure.
- Pause at 2% daily loss, 5% weekly loss, or three consecutive losses.
- No leverage, borrowing, averaging down, or martingale sizing.
- Simulate every transaction; require recognized programs and instruction shapes.
- Never use the main wallet. The model never possesses keys or participates in the signing path.

## Runtime provenance

Evidence class and runtime provenance are different controls. Every material observation must retain one of four provenance classes: on-chain fact, third-party label, model inference, or unknown. Third-party PnL, safety labels, social identities, and wallet rankings cannot become facts without reconciliation. Social virality alone can never authorize a trade.

Point-in-time records must include source, observed-at time, provider event time, chain slot or block time when available, ingestion time, confidence, and revision history. Missing or stale critical data causes abstention. The model may parse unstructured text and explain decisions, but it cannot authorize, size, sign, or submit a transaction.
