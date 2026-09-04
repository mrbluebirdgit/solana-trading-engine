# Intelligence architecture

The engine owns its data model, evidence fusion, scoring, risk controls, routing decisions, reconciliation, and audit trail. External products supply observations through replaceable adapters; no provider is allowed to become the strategy or a single source of truth.

## Provider boundary

Every adapter maps provider-specific fields into `TokenObservation` schema version 1. Core scoring will consume that schema rather than importing a provider SDK or field names. Each observation records its source and timestamp so conflicting data can be detected instead of silently averaged.

GMGN is currently authorized only for supplemental read-only intelligence. Its CLI is used only by an isolated health check and is version-pinned. No GMGN package is installed as a core engine dependency, and no GMGN trading instruction is accepted by the engine.

## Useful concepts extracted from GMGN

| Our evidence family | GMGN reference fields | Intended use |
|---|---|---|
| Market quality | price, volume, liquidity, market capitalization | Detect illiquid or distorted markets and compare provider snapshots |
| Ownership concentration | holder count, top-10 share, developer-team share | Reject concentrated supply and track distribution changes |
| Informed participation | smart-money and notable-wallet counts | Candidate discovery only; never an automatic buy signal |
| Adversarial activity | sniper count, bundled-trade share, suspicious-trader volume, bot share | Manipulation and crowded-entry penalties |
| Contract and trading risk | honeypot, wash trading, authority status, provider rug ratio | Hard-block candidates or require independent confirmation |
| Venue provenance | launchpad, exchange, creation time | Apply venue-specific age, liquidity, and migration rules |

These mappings are translations into our vocabulary, not copied strategy logic. Provider ratios remain labeled as provider evidence until Helius or another independent source corroborates them.

## What makes this engine independent

The planned decision path requires:

1. Multi-source observations with freshness and provenance.
2. Independent on-chain confirmation through Helius.
3. Transparent scoring with explicit evidence contributions.
4. Position, exposure, liquidity, loss, and duplicate-order limits.
5. A provider-neutral execution interface capable of comparing routes.
6. Deterministic replay and backtesting from recorded observations.
7. Reconciliation, immutable decision records, and a kill switch.

GMGN can be replaced or removed without rewriting those layers.

## Source references

- [GMGN OpenAPI skills and CLI reference](https://github.com/GMGNAI/gmgn-skills)
- [GMGN Agent API](https://docs.gmgn.ai/index/gmgn-agent-api)
- [GMGN public-key guide](https://docs.gmgn.ai/index/generate-public-key)

References are reviewed for capabilities and field semantics. External code is not vendored into the engine.
