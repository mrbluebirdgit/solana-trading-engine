# Market participation and attention feature specification v1

Status: **RESEARCH CONTRACT — LIVE-LOCKED**  
Runtime authority: **none**

This specification turns the supplied meme-coin “traffic” notes into measurable, provider-independent fields. It does not install a magic formula, authorize a buy, or claim that any historical cutoff maximizes profit. The machine-readable contract is `config/traffic-feature-catalog.v1.json`; supplied numeric bands are isolated in the non-authoritative `config/hypothesis-candidates.v1.json`; and the `TrafficSnapshot` schema and validation boundary are implemented in `src/core/intelligence/traffic-snapshot.mjs`. The canonical Pump/PumpSwap stage resolver, a read-only Helius point collector, a live-locked Pump log observer, an append-only observation ledger, and the separate observation-only [narrative radar](NARRATIVE_RADAR.md) exist. The radar can collect attention and match it to mints, but it does not populate a fully aligned historical `TrafficSnapshot` or authorize a trade. Durable market-traffic collectors, launch-cohort reconstruction, canonical migration-LP evidence collection, transactional paper-state persistence, and an actual always-on deployment are not implemented yet.

## Operational definition

For this engine, market participation and attention are a stack:

1. executed flow — volume, transactions and side imbalance;
2. participation breadth — raw trading wallets and evidence-adjusted entities;
3. ownership change — open-market acquisitions, holders and concentration;
4. executable market depth — verified reserves and size-specific entry/exit quotes;
5. attention — exact-mint-linked authors, communities, velocity and later on-chain conversion;
6. adversarial context — wash flow, early cohorts, funding links, provider labels and contradictions.

Price is useful context, but price alone cannot authorize a decision. Website visits can be attention evidence when a provider exposes them; they are not a substitute for on-chain participation.

## Evidence roles

| Role | Meaning | Runtime consequence |
|---|---|---|
| `ENGINEERING_INVARIANT` | Required to measure or execute safely | May become a hard gate after implementation tests |
| `EMPIRICAL_FEATURE` | Directionally useful in reviewed research | Observe, label and calibrate prospectively |
| `PROVIDER_LABEL` | Vendor-produced field with provider-specific semantics | Preserve source/version; never treat as canonical fact |
| `UNVALIDATED_HYPOTHESIS` | Plausible relationship or cutoff without transportable validation | Paper-test only |

All fields remain non-authoritative in this version. Missing values stay `null`; they are never silently changed to zero.

## Point-in-time contract

Each snapshot carries `observedAt`, `decisionCutoff`, `cutoffSlot`, source provenance, source-method version, event time and observation time. Supported initial windows are `30s`, `2m`, `5m`, `15m`, `1h`, `3h` and `24h`.

- Every event must exist by the decision cutoff.
- Provider snapshots reconstructed from later state are forbidden in training features.
- Windows must be event-time aligned and non-overlapping when used for velocity comparisons.
- Token-wide and pair-specific values must not be silently mixed.
- A routed swap must be deduplicated to one economic action before counts are calculated.
- Market capitalization and fully diluted valuation must remain distinct.

## Canonical computations

### Flow

Parse venue instructions and net balance changes before labeling a swap as a buy or sell from the tracked token's perspective. A positive token balance delta can also be a mint, transfer, pool movement or fee; balance direction alone is insufficient.

Store buy and sell notional, transaction counts, total volume, net buy volume and median trade size by window. Volume is turnover—not raw demand—and remains wash-sensitive.

### Participation breadth

`rawUniqueMakers` counts distinct economic wallet authorities, not token accounts. On Solana, aggregate associated token accounts by `preTokenBalances/postTokenBalances[].owner`; do not discard accounts merely because the token account itself is owned by the Token Program.

`entityAdjustedMakers` collapses wallets only through typed, confidence-bearing evidence. Funding edges, co-signing, exact bundle membership and transfer relationships remain separate edge types. Exchanges, bridges, fee sponsors, faucets and custody services require explicit treatment. A wallet address is not a person, and an entity result is an inference.

### Holders and concentration

Count open-market acquisitions separately from transfers. Report at least:

- raw holder count;
- raw top-ten supply share after deterministic program/pool/burn exclusions;
- provider-excluded concentration, if used, with the exclusion list;
- entity-adjusted concentration with model and edge versions;
- creator direct share and creator-linked inferred share separately.

Never use a current holder list to reconstruct what the engine would have known at an earlier decision time.

### Launch cohorts and bundles

There is deliberately no generic `bundle_pct`. Each independently reconstructed cohort records its own method, denominator, version, source and retained share:

| Method | What is measured | What it does not prove |
|---|---|---|
| `same_slot_candidate` | Parsed open-market buyers in the launch slot | Jito membership, common owner or manipulation |
| `exact_jito_bundle` | One to five transaction signatures with landed bundle status, a landing slot no later than the decision cutoff, `containsLaunchActivity = true` and `containsBuyActivity = true` | Common beneficial ownership or malicious intent; a returned bundle ID or tip is insufficient |
| `funding_linked_cluster` | Early buyers linked through typed funding evidence | Identity; shared services can create false links |
| `union_model` | Versioned union of at least two explicit cohort methods, with an `overlapEvidenceRef` to the deduplication evidence | Ground truth; overlap and uncertainty must be retained |

Provider output is stored separately in `providerLabels`, never inserted into `launchCohorts`. Each label keeps provider, raw field, method version, value and denominator. GMGN's `bundler_rate` is normalized with denominator `unspecified` because its published references use inconsistent descriptions; `bundler_trader_amount_rate` alone is normalized as `trading_volume`. Neither is an independently reconstructed supply cohort.

Initial supply share, currently retained supply share and trading-volume share are separate fields. A provider's bundled-volume ratio must never be compared as if it were an Axiom-style supply-held ratio. A Jito submit response, bundle ID or tip transfer may identify a candidate, but only confirmed landed status plus landing slot, one to five included signatures and explicit launch-and-buy activity confirmation qualifies as `exact_jito_bundle` evidence.

### Token capabilities

Mint and freeze authority remain applicable on a Pump bonding curve just as they do after migration. A collector must read those authorities and supported Token-2022 extensions from canonical state. It must never translate “on curve” into `N/A`, and a read failure remains `unknown`. A policy may reject an active capability as a risk choice, but active authority is not by itself proof of malicious intent.

### Liquidity and execution

Absolute pool liquidity and liquidity-to-market-cap are research features, not universal tradability gates. Eligibility requires a fresh quote for this intended notional, an independently constructed exit, exact transaction simulation, price impact and a full all-in cost estimate. Slippage tolerance is a maximum accepted execution deviation; it is not price impact and it is not a target.

All-in cost includes protocol, creator, route and interface fees; priority fee; Jito tip where used; impact; quote-to-land drift; failed attempts; MEV/tail stress; and exit cost. Fee schedules and quote-mint configuration are versioned inputs.

For a canonical Pump migration, verify the canonical PumpSwap pool plus the migration's initial LP mint-and-burn event. Current migration burns that initial issuance, but later PumpSwap deposits can mint LP tokens and withdrawals can redeem them. A generic present-time “LP burned” or LP-supply field is therefore insufficient to prove the migration path, current withdrawability or deployer control.

### Venue stage

Pump lifecycle stage comes from current program/account state—not USD market cap. The resolver must read program/config data interpreted against a recorded, reviewed IDL reference, quote mint, curve completion and canonical pool identity, then emit these predicates:

| Stage | Required canonical evidence |
|---|---|
| `pump_curve_active` | Exact curve PDA explicitly exists; Pump owner, decode, quote mint, reserves and supply validate; `complete = false` |
| `migration_pending` | The same fully validated curve has `complete = true`, and the exact canonical PumpSwap pool is explicitly absent |
| `pumpswap_amm` | Exact canonical pool explicitly exists; PumpSwap owner, decode, base/quote mints and PDA relationship validate |
| `other_amm` | Reserved until a non-PumpSwap venue decoder/program ID is allowlisted; v1 emits `unknown` for caller-supplied third-party pool flags |
| `unknown` | Required state unavailable, stale or contradictory |

Curve completion and migration are separate state changes. Current `migrate`/`migrate_v2` operations are permissionless and idempotent; they are not an automatic transition that can be assumed when `complete` flips. PumpSwap is the current canonical destination, and the legacy Raydium withdrawal path is disabled. Third-party pools remain `other_amm` rather than evidence of canonical migration.

Roughly `$69k` / `~85 SOL` remains current default-SOL configuration shorthand. It is non-universal across configuration, quote mint and SOL/USD price and is deprecated as a stage classifier; the resolver uses the predicates above instead.

### Social attention

Link records to the exact mint, verified project account or a documented disambiguation method. Store mention count, unique authors, source communities, suspected-automation share and change versus a token-specific prior baseline.

Social data is confirmatory and may be useful for graduation/attention research, but it cannot independently authorize a trade. Missing social coverage is `unknown`, not zero. Telegram bots cannot see messages sent by other bots, and group visibility depends on membership/admin/privacy configuration, so collection coverage must be recorded.

## Provider mapping

| Source | Primary responsibility | Important limitation |
|---|---|---|
| Canonical Solana + recorded Pump IDL reference | Program state, slots, instructions, balances, authorities, curve/pool state, fills | Raw transactions require venue-aware parsing; upgrades require revalidation |
| Helius | Low-latency RPC/stream transport, parsed-event acceleration, history/funding inputs | Infrastructure and parsing do not create edge; paid features depend on plan |
| Birdeye | Token/pair volume, buy/sell flow, unique-wallet windows, holders, distribution | Wallet vs token-account mode and token vs pair scope must be explicit |
| GMGN | Supplemental holder, smart-wallet, sniper, creator, rug and bundler labels | `bundler_rate` keeps an unspecified provider denominator; `bundler_trader_amount_rate` is trading-volume share; throughput/field stability require defensive clients |
| Jupiter/direct math | Intended-size route, impact, build and exit feasibility | Quote/build are not fills and expire quickly |
| DEX Screener | Discovery, pair volume/transactions/liquidity, trending and boost context | Public pair API does not document unique makers; trending includes paid boosts and other inputs |
| X/Telegram/Discord | Raw timestamped attention records | Identity, automation, access and reverse-causality problems |
| Dune | Retrospective chain research and reproducible aggregates | Not the primary low-latency decision feed; routed rows require deduplication |
| Solscan/other explorers | Human audit links and cross-checks | Optional; not a required low-latency dependency |

## Separate prediction targets

The engine must never train one vague “winner” label. At minimum, keep these targets separate:

1. `p_graduation` — probability a curve completes within a declared horizon;
2. `p_adverse` — probability of a declared rug, unsellable, manipulation or drawdown event;
3. `net_follower_return_distribution` — return from the engine's later executable fill after all costs;
4. `p_execution` — probability of landing and filling within the quote/risk budget;
5. capacity — maximum notional supported before expected edge is consumed by impact and crowding.

Graduation can correlate with fast participation while the same thin, concentrated launch can have high post-migration risk. Those are not contradictory once targets are separated.

## Promotion protocol

Candidate features and thresholds can move toward runtime use only after:

- point-in-time collection under the current program and fee regime;
- chronological, purged train/tune/test splits;
- unseen creator/funder/entity stress splits;
- results net of entry/exit fees, tips, impact, failures and latency;
- calibrated probabilities with confidence intervals and minimum support;
- multiple-testing correction and an untouched holdout;
- stability across at least two materially different market regimes;
- paper execution through the same intended lifecycle;
- an explicit versioned promotion change that keeps rollback possible.

The existing live lock remains in force. This specification adds measurement discipline; it does not enable signing, submission or autonomous buying.

## Primary references

- [Pump.fun public program documentation](https://github.com/pump-fun/pump-public-docs)
- [Pump.fun current fee and quote-mint documentation](https://pump.fun/docs/fees)
- [Solana RPC structures](https://solana.com/docs/rpc/json-structures)
- [Jito bundle/send semantics](https://docs.jito.wtf/lowlatencytxnsend/)
- [Jupiter slippage estimation](https://developers.jup.ag/docs/swap/advanced/slippage)
- [Helius documentation index](https://www.helius.dev/docs/llms.txt)
- [DEX Screener API](https://docs.dexscreener.com/api/reference) and [Trending](https://docs.dexscreener.com/trending)
- [Birdeye token trade data](https://data.birdeye.so/docs/data-api/stats/get-defi-v3-token-trade-data-single) and [holders](https://data.birdeye.so/docs/data-api/holder/get-defi-v3-token-holder)
- [GMGN market field reference](https://github.com/GMGNAI/gmgn-skills/blob/main/skills/gmgn-market/SKILL.md)
- [MELT/MemeTrans](https://arxiv.org/html/2602.13480v2)
- [Pump.fun graduation study](https://arxiv.org/html/2602.14860v1)
- [Graduation Regime Windows v3](https://arxiv.org/abs/2607.02823v3)
- [X Post Counts](https://docs.x.com/x-api/posts/counts/introduction)
- [Telegram Bot FAQ](https://core.telegram.org/bots/faq#what-messages-will-my-bot-get)
