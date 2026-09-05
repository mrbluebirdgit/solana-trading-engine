# Intelligence architecture

The engine owns its data model, evidence fusion, scoring, risk controls, routing decisions, reconciliation, and audit trail. External products supply observations through replaceable adapters; no provider is allowed to become the strategy or a single source of truth.

## Provider boundary

The GMGN adapter maps its provider-specific market and intelligence fields into `TokenObservation` schema version 2. Version 2 preserves GMGN's `bundler_rate` as `providerBundlerRate` with an unspecified denominator and maps `bundler_trader_amount_rate` separately to `providerBundledTradingVolumeShare`. Both retain a provider method/version, so neither can be mistaken for supply held or an independently reconstructed cohort. Jupiter maps to `RouteQuote`; Helius stage collection uses its own point-in-time stage contract. A separate point-in-time `TrafficSnapshot` composes aligned multi-window flow, participation, ownership, executable-depth and social measurements without producing a verdict. Its `providerLabels` collection is deliberately outside `launchCohorts`. Core scoring will consume these internal schemas rather than importing a provider SDK or field names. Each observation and snapshot-provenance record includes its source, source-method version and timestamp so conflicting data can be detected instead of silently averaged.

These schemas and validation boundaries are implemented. The canonical venue-stage resolver, a read-only Helius point collector, a live-locked Pump log observer, an append-only observation ledger, and an observation-only narrative radar also exist. The radar uses provider adapters, a shared entity/cluster pipeline, canonical Pump mint events, and non-authoritative research scoring; aggregate social providers collapse to one social evidence channel. Durable market-traffic collectors, launch-cohort builders, canonical migration-LP evidence collection, transactional paper-state persistence, and an actual always-on deployment do not. No schema instance should be described as independently verified merely because it validates structurally or was populated by one adapter.

GMGN is currently authorized only for supplemental read-only intelligence. Its CLI-backed health check is an optional local scaffold; it is not installed in GitHub Actions and no repository secret is exposed to it. Automated verification remains disabled until the dependency and its transitive supply chain can be reviewed and reproducibly locked. No GMGN package is installed as a core engine dependency, and no GMGN trading instruction is accepted by the engine.

Jupiter is currently authorized for read-only price and route data. Its provider response is translated into our own `RouteQuote` schema before the engine sees it. The read-only adapter never supplies a taker, receiver, or payer, and it deliberately drops any transaction data from provider responses. Building, signing, and submitting transactions remain separate, disabled capabilities.

## Useful concepts extracted from GMGN

| Our evidence family | GMGN reference fields | Intended use |
|---|---|---|
| Market quality | price, volume, liquidity, market capitalization | Detect illiquid or distorted markets and compare provider snapshots |
| Ownership concentration | holder count, top-10 share, developer-team share | Reject concentrated supply and track distribution changes |
| Informed participation | smart-money and notable-wallet counts | Candidate discovery only; never an automatic buy signal |
| Adversarial activity | sniper count, `bundler_rate`, bundled-trading-volume share, suspicious-trader volume, bot share | Provider-labeled context only; denominator and method/version are retained, while independently derived same-slot, landed-Jito, funding and retained-supply cohorts remain separate |
| Contract and trading risk | honeypot, wash trading, authority status, provider rug ratio | Hard-block candidates or require independent confirmation |
| Venue provenance | launchpad, exchange, creation time | Apply venue-specific age, liquidity, and migration rules |

These mappings are translations into our vocabulary, not copied strategy logic. Provider ratios remain labeled as provider evidence until Helius or another independent source corroborates them.

The full measurement contract and provider limitations are in [the market participation specification](TRAFFIC_FEATURE_SPECIFICATION.md). No provider adapter may infer Pump lifecycle stage from market cap, reconstruct a historical feature from current state, equate a wallet with a person, or collapse different bundle denominators into one field. An `exact_jito_bundle` requires landed status, landing slot, one to five included transaction signatures, and explicit confirmation of both launch and buy activity; a returned bundle ID or nearby tip is not enough.

## What makes this engine independent

The planned decision path requires:

1. Multi-source observations with freshness and provenance.
2. Independent on-chain confirmation through Helius.
3. Transparent scoring with explicit evidence contributions.
4. Position, exposure, liquidity, loss, and duplicate-order limits.
5. A provider-neutral execution interface capable of comparing routes.
6. Deterministic replay and backtesting from recorded observations.
7. Reconciliation, immutable decision records, and a kill switch.

GMGN or Jupiter can be replaced or removed without rewriting those layers.

## Source references

- [GMGN OpenAPI skills and CLI reference](https://github.com/GMGNAI/gmgn-skills)
- [GMGN Agent API](https://docs.gmgn.ai/index/gmgn-agent-api)
- [GMGN public-key guide](https://docs.gmgn.ai/index/generate-public-key)
- [Jupiter Swap API](https://developers.jup.ag/docs/swap)

References are reviewed for capabilities and field semantics. External code is not vendored into the engine.
