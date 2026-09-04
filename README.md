# Solana Trading Engine

A private, modular system for researching Solana activity, scoring trade opportunities, enforcing risk limits, and eventually routing approved live orders through execution providers such as GMGN.

## Current status

The repository foundation plus Telegram, Helius, GMGN, Jupiter, and Birdeye credential validation are active. Research governance is now explicit: material rules carry a source, evidence class, limitations, and calibration status; research hypotheses must define falsification tests before an experiment can promote them. The current numeric policy is a set of paper-only hypotheses and conservative guardrails—not empirically proven optimums. The `TokenObservation` and `TrafficSnapshot` schemas exist, but the Pump/PumpSwap collectors and canonical stage resolver do not. No master trading executor exists yet, and live trading remains locked until the signal, risk, execution, validation, and audit layers have been implemented and verified.

See the [strategy specification](docs/STRATEGY_SPECIFICATION.md), [evidence ledger](docs/EVIDENCE_LEDGER.md), [research and calibration protocol](docs/RESEARCH_AND_CALIBRATION_PROTOCOL.md), [master decision contract](docs/MASTER_DECISION_CONTRACT.md), [market participation feature specification](docs/TRAFFIC_FEATURE_SPECIFICATION.md), [audit of supplied recommendations](docs/SUPPLIED_RECOMMENDATION_AUDIT.md), [machine-readable evidence registry](config/evidence-registry.v1.json), [traffic feature catalog](config/traffic-feature-catalog.v1.json), [paper-only hypothesis candidates](config/hypothesis-candidates.v1.json), [versioned policy](config/policy.v1.yaml), and [complete integration roadmap](docs/INTEGRATION_ROADMAP.md).

## Research-governed decision system

The future executor must estimate three separate quantities: adverse-event/manipulation risk, net follower return after all costs, and execution/landing probability. It may combine them only through the deterministic policy and only after point-in-time, chronological validation. API access improves data coverage and reliability; it does not create predictive edge by itself.

The repository rejects fixed “magic formulas,” raw leader copying, social virality as authorization, provider labels as ground truth, and any claim that a backtest proves future profit. The evidence-registry validator keeps those shortcuts forbidden while the project is live-locked.

## Planned pipeline

1. Collect Telegram, on-chain, market, and social signals.
2. Normalize and deduplicate events.
3. Score opportunities using transparent strategy rules.
4. Apply position, liquidity, loss, exposure, and kill-switch limits.
5. Route approved orders through an execution adapter.
6. Reconcile fills and record every decision and transaction.

## Telegram configuration

The first integration uses Telegram's user API for signal monitoring and eventual GMGN Bot communication.

Required secret names:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`

Add those values as GitHub Actions repository secrets. Never put real values in `.env.example`, commits, issues, pull requests, screenshots, or chat.

To verify repository-secret formatting, manually run the **Verify integrations** workflow from the Actions tab or post the exact owner-only command `/verify telegram` on a repository issue. The workflow never prints secret values and is not triggered by pull requests.

On the future Mac, copy `.env.example` to `.env`, enter the same values locally, and run:

```bash
npm run verify:telegram:local
```

The first Telegram authorization will be performed interactively on that Mac using Telegram's QR-login flow. A phone number is therefore not required as a GitHub secret. If code-based login is ever used as a fallback, enter the phone number only at the local prompt. The login code, 2FA password, phone number, and generated session must remain local.

## Helius configuration

Helius supplies the Solana RPC, transaction, and webhook infrastructure used to monitor wallets and on-chain events.

Required secret name:

- `HELIUS_API_KEY`

Add the project key as a GitHub Actions repository secret. The key must never be committed or pasted into an issue, pull request, screenshot, or chat. Use the **Verify integrations** workflow with provider `helius`, or post the exact owner-only command `/verify helius` on a repository issue, to validate its formatting and make a live, read-only mainnet RPC health request.

## GMGN reference integration

GMGN is one external intelligence source, not the engine's strategy, risk authority, or master architecture. Its market and behavioral fields are normalized into our own provider-independent observation format so they can later be corroborated against Helius, Telegram, social, and execution-quote sources.

Required secret name:

- `GMGN_API_KEY`

The current GMGN key is read-only. Use the **Verify integrations** workflow with provider `gmgn`, or post the exact owner-only command `/verify gmgn` on a repository issue, to make a minimal live read request without displaying the key or token data. Trading permissions, signing keys, and GMGN-controlled execution remain disabled.

See [intelligence architecture](docs/INTELLIGENCE_ARCHITECTURE.md) for the boundary between external references and our engine.

## Jupiter reference integration

Jupiter provides an independent source for prices, swap quotes, and route comparison. It is an execution candidate, not the engine's strategy or risk authority.

Required secret name:

- `JUPITER_API_KEY`

Use the **Verify integrations** workflow with provider `jupiter`, or post the exact owner-only command `/verify jupiter` on a repository issue. Verification makes one authenticated, read-only SOL price request and never logs the key or returned price. The quote adapter omits wallet parameters and translates provider responses into our own `RouteQuote` schema. Wallet creation, transaction building, signing, and submission remain disabled.

## Security boundaries

- No wallet seed phrase or private signing key belongs in GitHub, ChatGPT, logs, or screenshots.
- Use a separate Telegram account and a separate, balance-capped trading wallet.
- GitHub workflows receive API credentials only through encrypted repository secrets.
- Secret-bearing workflows are manual and use read-only repository permissions.
- `LIVE_TRADING_ENABLED` defaults to `false` and requires a deliberate local production change.

See [API inventory](docs/API_INVENTORY.md) and [security policy](SECURITY.md).
